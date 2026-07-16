import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearFamilyMembers, replaceFamilyMembers } from "../data/familyData";
import {
  acceptInvitation, createFamily, deleteMember, fetchSnapshot, hasSession, leaveFamily, linkCurrentUser, listFamilies,
  loginWithWebCode, loginWithWechatCallback, logout, saveMember,
} from "../services/api";
import type { MemberInput } from "../services/api";
import type { FamilySnapshot, FamilySummary } from "../types/family";

const ACTIVE_FAMILY_KEY = "little-family:web-active-family-id";

interface FamilyContextValue {
  status: "loading" | "anonymous" | "ready" | "empty" | "error";
  error: string;
  families: FamilySummary[];
  snapshot: FamilySnapshot | null;
  login: (code: string) => Promise<void>;
  loginWithWechat: (code: string, state: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchFamily: (familyId: string) => Promise<void>;
  createNewFamily: (name: string) => Promise<void>;
  joinFamily: (code: string) => Promise<void>;
  leaveCurrentFamily: () => Promise<void>;
  saveFamilyMember: (input: MemberInput, memberId?: string) => Promise<void>;
  deleteFamilyMember: (memberId: string) => Promise<void>;
  setLinkedMember: (memberId: string | null) => Promise<"approved" | "pending">;
  refresh: () => Promise<void>;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<FamilyContextValue["status"]>("loading");
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [snapshot, setSnapshot] = useState<FamilySnapshot | null>(null);

  const load = useCallback(async (preferredFamilyId?: string) => {
    if (!hasSession()) {
      clearFamilyMembers();
      setStatus("anonymous");
      setFamilies([]);
      setSnapshot(null);
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const available = await listFamilies();
      setFamilies(available);
      if (available.length === 0) {
        clearFamilyMembers();
        setSnapshot(null);
        setStatus("empty");
        return;
      }
      const saved = preferredFamilyId ?? localStorage.getItem(ACTIVE_FAMILY_KEY);
      const active = available.find((family) => family.id === saved) ?? available[0];
      const nextSnapshot = await fetchSnapshot(active.id);
      localStorage.setItem(ACTIVE_FAMILY_KEY, active.id);
      replaceFamilyMembers(nextSnapshot.members, nextSnapshot.family.name);
      setSnapshot(nextSnapshot);
      setStatus("ready");
    } catch (cause) {
      clearFamilyMembers();
      const message = cause instanceof Error ? cause.message : "家庭数据加载失败";
      setError(message);
      setStatus(hasSession() ? "error" : "anonymous");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const value = useMemo<FamilyContextValue>(() => ({
    status,
    error,
    families,
    snapshot,
    login: async (code) => {
      await loginWithWebCode(code);
      await load();
    },
    loginWithWechat: async (code, oauthState) => {
      await loginWithWechatCallback(code, oauthState);
      await load();
    },
    signOut: async () => {
      await logout();
      localStorage.removeItem(ACTIVE_FAMILY_KEY);
      clearFamilyMembers();
      setSnapshot(null);
      setFamilies([]);
      setStatus("anonymous");
    },
    switchFamily: async (familyId) => load(familyId),
    createNewFamily: async (name) => {
      const family = await createFamily(name);
      await load(family.id);
    },
    joinFamily: async (code) => {
      const familyId = await acceptInvitation(code);
      await load(familyId);
    },
    leaveCurrentFamily: async () => {
      if (!snapshot) return;
      await leaveFamily(snapshot.family.id);
      localStorage.removeItem(ACTIVE_FAMILY_KEY);
      await load();
    },
    saveFamilyMember: async (input, memberId) => {
      if (!snapshot) return;
      await saveMember(snapshot.family.id, input, memberId);
      await load(snapshot.family.id);
    },
    deleteFamilyMember: async (memberId) => {
      if (!snapshot) return;
      await deleteMember(snapshot.family.id, memberId);
      await load(snapshot.family.id);
    },
    setLinkedMember: async (memberId) => {
      if (!snapshot) return "approved";
      const result = await linkCurrentUser(snapshot.family.id, memberId);
      if (result.status === "approved") await load(snapshot.family.id);
      return result.status;
    },
    refresh: () => load(snapshot?.family.id),
  }), [error, families, load, snapshot, status]);

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export const useFamily = (): FamilyContextValue => {
  const context = useContext(FamilyContext);
  if (!context) throw new Error("useFamily 必须在 FamilyProvider 中使用");
  return context;
};
