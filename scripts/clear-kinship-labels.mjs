import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const usage = `用法：
  npm run clear:kinship-labels -- --yes
  npm run clear:kinship-labels -- --db apps/api/data/little-family.db --yes
  npm run clear:kinship-labels -- --family-id <家庭UUID> --yes

说明：
  清空 kinship_labels 成员称呼缓存后，重新打开成员列表/生日页时 API 会重新生成并回填。
  不传 --yes 时只统计将要删除的记录，不会改数据库。`

const args = process.argv.slice(2)
const valueOf = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const hasFlag = name => args.includes(name)
const resolveDefaultDbPath = () => {
  const candidates = [
    process.env.DATABASE_PATH,
    'apps/api/data/little-family.db',
    'data/little-family.db',
  ].filter(Boolean)
  const found = candidates
    .map(candidate => path.resolve(process.cwd(), candidate))
    .find(candidate => fs.existsSync(candidate))
  return found ?? path.resolve(process.cwd(), 'apps/api/data/little-family.db')
}

const dbPath = valueOf('--db')
  ? path.resolve(process.cwd(), valueOf('--db'))
  : resolveDefaultDbPath()
const familyId = valueOf('--family-id')
const confirmed = hasFlag('--yes')

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(usage)
  process.exit(0)
}

if (!fs.existsSync(dbPath)) {
  console.error(`数据库文件不存在：${dbPath}`)
  console.error(usage)
  process.exit(1)
}

const pythonScript = String.raw`
import json
import sqlite3
import sys

db_path = sys.argv[1]
family_id = sys.argv[2] or None
confirmed = sys.argv[3] == 'yes'

connection = sqlite3.connect(db_path)
try:
    table = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kinship_labels'"
    ).fetchone()
    if table is None:
        print(json.dumps({"exists": False}, ensure_ascii=False))
        sys.exit(0)

    params = (family_id,) if family_id else ()
    where = "WHERE family_id = ?" if family_id else ""
    count = connection.execute(f"SELECT COUNT(*) FROM kinship_labels {where}", params).fetchone()[0]
    deleted = 0

    if confirmed:
        cursor = connection.execute(f"DELETE FROM kinship_labels {where}", params)
        deleted = cursor.rowcount
        connection.commit()

    print(json.dumps({"exists": True, "count": count, "deleted": deleted}, ensure_ascii=False))
finally:
    connection.close()
`

const runPython = command => spawnSync(command, ['-c', pythonScript, dbPath, familyId ?? '', confirmed ? 'yes' : 'no'], {
  encoding: 'utf8',
})

let result = runPython('python')
if (result.error || result.status !== 0) {
  result = runPython('python3')
}

if (result.error) {
  console.error('未找到可用的 python/python3，无法访问 SQLite。')
  console.error(result.error.message)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(result.stderr || '清理失败')
  process.exit(result.status ?? 1)
}

const output = JSON.parse(result.stdout)
if (!output.exists) {
  console.log('kinship_labels 表不存在，无需清理。')
  process.exit(0)
}

const scope = familyId ? `家庭 ${familyId}` : '全部家庭'
console.log(`数据库：${dbPath}`)
console.log(`范围：${scope}`)
console.log(`待清理称呼缓存：${Number(output.count)} 条`)

if (!confirmed) {
  console.log('未传 --yes，仅统计未删除。确认后重新运行并追加 --yes。')
} else {
  console.log(`已清理称呼缓存：${Number(output.deleted)} 条`)
}
