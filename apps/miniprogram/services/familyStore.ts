import { familyMembers, replaceFamilyMembers } from '../utils/familyData'
import {
  fetchSnapshot, getActiveFamilyId, getFamilyDataCacheKey, listFamilies, refreshKinshipLabels,
  setActiveFamilyId,
  type FamilySnapshot, type FamilySummary,
} from './api'

let currentSnapshot: FamilySnapshot | null = null
let currentCacheKey = ''
let loadingPromise: Promise<FamilySnapshot | null> | null = null
let loadingCacheKey = ''
let loadVersion = 0

export const getCurrentSnapshot = (): FamilySnapshot | null => currentSnapshot

export const ensureFamilyData = (force = false): Promise<FamilySnapshot | null> => {
  const cacheKey = getFamilyDataCacheKey()
  if (!force && currentSnapshot && currentCacheKey === cacheKey) return Promise.resolve(currentSnapshot)
  if (currentCacheKey !== cacheKey) {
    currentSnapshot = null
    replaceFamilyMembers([])
  }
  if (loadingPromise && loadingCacheKey === cacheKey) return loadingPromise

  const version = ++loadVersion
  loadingCacheKey = cacheKey
  const promise = listFamilies()
    .then(async families => {
      if (version !== loadVersion) return currentSnapshot
      if (families.length === 0) {
        currentSnapshot = null
        currentCacheKey = getFamilyDataCacheKey()
        replaceFamilyMembers([])
        return null
      }
      let familyId = getActiveFamilyId()
      if (!families.some(family => family.id === familyId)) {
        familyId = families[0].id
        setActiveFamilyId(familyId)
      }
      const snapshot = await fetchSnapshot(familyId)
      if (version !== loadVersion) return currentSnapshot
      currentSnapshot = snapshot
      currentCacheKey = getFamilyDataCacheKey()
      replaceFamilyMembers(snapshot.members)
      return currentSnapshot
    })
    .finally(() => {
      if (loadingPromise === promise) {
        loadingPromise = null
        loadingCacheKey = ''
      }
    })
  loadingPromise = promise
  return loadingPromise
}

export const switchFamily = async (family: FamilySummary): Promise<void> => {
  setActiveFamilyId(family.id)
  loadVersion += 1
  currentSnapshot = null
  currentCacheKey = ''
  await ensureFamilyData(true)
}

export const refreshFamilyKinshipLabels = async (): Promise<FamilySnapshot | null> => {
  const snapshot = await ensureFamilyData()
  const familyId = snapshot?.family.id
  if (!familyId) return null
  currentSnapshot = await refreshKinshipLabels(familyId)
  currentCacheKey = getFamilyDataCacheKey()
  replaceFamilyMembers(currentSnapshot.members)
  return currentSnapshot
}

export const invalidateFamilyData = (): void => {
  loadVersion += 1
  currentSnapshot = null
  currentCacheKey = ''
  familyMembers.splice(0, familyMembers.length)
}
