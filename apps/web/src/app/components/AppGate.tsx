import { useEffect, useRef, useState } from "react";
import { ArrowRight, KeyRound, LoaderCircle, QrCode, RefreshCw, Users } from "lucide-react";
import { RouterProvider } from "react-router";
import { useFamily } from "../context/FamilyContext";
import { router } from "../routes";
import { getWechatLoginUrl } from "../services/api";

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7f3ef] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 md:p-8 shadow-xl border border-[#eadfd8]">
        {children}
      </div>
    </main>
  );
}

function LoginView() {
  const { login, loginWithWechat } = useFamily();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const handledCallback = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("code");
    const oauthState = params.get("state");
    if (!oauthCode || !oauthState || handledCallback.current) return;
    handledCallback.current = true;
    window.history.replaceState({}, "", "/");
    setWechatLoading(true);
    setError("");
    void loginWithWechat(oauthCode, oauthState)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "微信扫码登录失败"))
      .finally(() => setWechatLoading(false));
  }, [loginWithWechat]);

  const startWechatLogin = async () => {
    setWechatLoading(true);
    setError("");
    try {
      window.location.assign(await getWechatLoginUrl());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法发起微信扫码登录");
      setWechatLoading(false);
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await login(code.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <CenterCard>
      <div className="w-14 h-14 rounded-2xl bg-[#07c160]/10 flex items-center justify-center mb-5">
        <QrCode className="text-[#07a94f]" />
      </div>
      <p className="text-xs tracking-[0.28em] text-[#a8866c] font-bold mb-2">LITTLE FAMILY</p>
      <h1 className="text-3xl font-black text-[#2d1f1a]">登录家族图谱</h1>
      <p className="text-sm text-gray-500 mt-3 leading-6">微信扫码或使用小程序登录码，进入同一个家庭空间。</p>
      <button
        type="button"
        onClick={() => void startWechatLogin()}
        disabled={wechatLoading || submitting}
        className="mt-6 w-full rounded-2xl bg-[#07c160] text-white py-3.5 font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-100"
      >
        {wechatLoading ? <LoaderCircle size={18} className="animate-spin" /> : <QrCode size={18} />}
        {wechatLoading ? "正在连接微信" : "微信扫码登录"}
      </button>

      <div className="flex items-center gap-3 my-5 text-xs text-gray-300"><span className="h-px flex-1 bg-gray-200" />或使用小程序登录码<span className="h-px flex-1 bg-gray-200" /></div>
      <div className="flex items-start gap-2 rounded-2xl bg-[#f7f3ef] px-3 py-2.5 mb-3 text-xs text-gray-500 leading-5">
        <KeyRound size={15} className="mt-0.5 text-[#a8866c] flex-shrink-0" />
        打开“小家记”小程序，在“我的 → 家庭与成员管理”生成登录码。
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="输入 12 位一次性登录码"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          className="w-full rounded-2xl bg-[#f7f3ef] border border-[#eadfd8] px-4 py-3.5 text-center tracking-[0.16em] uppercase outline-none focus:ring-2 focus:ring-[#d4756a]/25"
        />
        {error && <p className="text-sm text-[#c0564b]">{error}</p>}
        <button disabled={submitting || !code.trim()} className="w-full rounded-2xl bg-[#d4756a] text-white py-3.5 font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          {submitting ? "正在登录" : "进入我的家庭"}
        </button>
      </form>
      <p className="text-xs text-gray-400 text-center mt-4">登录码 5 分钟内有效，使用一次后立即失效</p>
    </CenterCard>
  );
}

function EmptyView() {
  const { createNewFamily, joinFamily } = useFamily();
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try { await action(); } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "操作失败");
    } finally { setBusy(false); }
  };
  return (
    <CenterCard>
      <div className="w-14 h-14 rounded-2xl bg-[#6b9d8a]/10 flex items-center justify-center mb-5"><Users className="text-[#6b9d8a]" /></div>
      <h1 className="text-2xl font-black text-[#2d1f1a]">开始记录你的家庭</h1>
      <p className="text-sm text-gray-500 mt-2">当前账号还没有加入家庭，可以创建新家庭或输入亲人分享的邀请码。</p>
      <div className="mt-6 space-y-3">
        <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="家庭名称" className="w-full rounded-2xl bg-[#f7f3ef] border border-[#eadfd8] px-4 py-3 outline-none" />
        <button disabled={busy || !familyName.trim()} onClick={() => void run(() => createNewFamily(familyName.trim()))} className="w-full rounded-2xl bg-[#d4756a] text-white py-3 font-bold disabled:opacity-50">创建家庭</button>
      </div>
      <div className="flex items-center gap-3 my-5 text-xs text-gray-300"><span className="h-px flex-1 bg-gray-200" />或<span className="h-px flex-1 bg-gray-200" /></div>
      <div className="space-y-3">
        <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="家庭邀请码" className="w-full rounded-2xl bg-[#f7f3ef] border border-[#eadfd8] px-4 py-3 outline-none" />
        <button disabled={busy || !inviteCode.trim()} onClick={() => void run(() => joinFamily(inviteCode.trim()))} className="w-full rounded-2xl border border-[#6b9d8a] text-[#477868] py-3 font-bold disabled:opacity-50">加入家庭</button>
      </div>
      {message && <p className="text-sm text-[#c0564b] mt-4">{message}</p>}
    </CenterCard>
  );
}

export default function AppGate() {
  const { status, error, refresh } = useFamily();
  if (status === "anonymous") return <LoginView />;
  if (status === "empty") return <EmptyView />;
  if (status === "error") return (
    <CenterCard>
      <h1 className="text-xl font-black text-[#2d1f1a]">暂时无法加载家庭数据</h1>
      <p className="text-sm text-gray-500 mt-2">{error}</p>
      <button onClick={() => void refresh()} className="mt-5 w-full rounded-2xl bg-[#6b9d8a] text-white py-3 font-bold flex items-center justify-center gap-2"><RefreshCw size={16} />重试</button>
    </CenterCard>
  );
  if (status !== "ready") return <div className="min-h-screen bg-[#f7f3ef] flex items-center justify-center text-[#a8866c]"><LoaderCircle className="animate-spin" /></div>;
  return <RouterProvider router={router} />;
}
