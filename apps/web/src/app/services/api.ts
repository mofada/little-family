import type { FamilySnapshot, FamilySummary } from "../types/family";

const TOKEN_KEY = "little-family:web-token";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}

export interface MemberInput {
  name: string;
  nickName?: string | null;
  relation: string;
  birthYear: number | null;
  gender: "male" | "female" | "unknown";
  birthdayType: "solar" | "lunar" | null;
  birthMonth: number | null;
  birthDay: number | null;
  isLeapMonth?: boolean;
  parentIds?: string[];
  spouseId?: string | null;
}

export const hasSession = (): boolean => Boolean(localStorage.getItem(TOKEN_KEY));

const request = async <T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> => {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  if (response.status === 401 && authenticated) localStorage.removeItem(TOKEN_KEY);
  const body = await response.json().catch(() => ({})) as ApiErrorBody;
  throw new ApiError(body.error?.message ?? `请求失败（${response.status}）`, response.status, body.error?.code);
};

export const loginWithWebCode = async (code: string): Promise<void> => {
  const result = await request<{ token: string }>("/api/auth/web", {
    method: "POST",
    body: JSON.stringify({ code }),
  }, false);
  localStorage.setItem(TOKEN_KEY, result.token);
};

export const getWechatLoginUrl = async (): Promise<string> => {
  const result = await request<{ configured: boolean; authorizeUrl?: string }>(
    "/api/auth/wechat-web/url",
    { method: "POST" },
    false,
  );
  if (!result.configured || !result.authorizeUrl) {
    throw new ApiError("微信扫码登录尚未配置，请先使用小程序登录码", 503, "WECHAT_WEB_NOT_CONFIGURED");
  }
  return result.authorizeUrl;
};

export const loginWithWechatCallback = async (code: string, state: string): Promise<void> => {
  const result = await request<{ token: string }>("/api/auth/wechat-web", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  }, false);
  localStorage.setItem(TOKEN_KEY, result.token);
};

export const logout = async (): Promise<void> => {
  try {
    await request<void>("/api/auth/session", { method: "DELETE" });
  } finally {
    localStorage.removeItem(TOKEN_KEY);
  }
};

export const listFamilies = async (): Promise<FamilySummary[]> => {
  const result = await request<{ families: FamilySummary[] }>("/api/families");
  return result.families;
};

export const fetchSnapshot = (familyId: string): Promise<FamilySnapshot> =>
  request(`/api/families/${familyId}/snapshot`);

export const createFamily = async (name: string): Promise<FamilySummary> => {
  const result = await request<{ family: FamilySummary }>("/api/families", {
    method: "POST",
    body: JSON.stringify({ name, description: "" }),
  });
  return result.family;
};

export const acceptInvitation = async (code: string): Promise<string> => {
  const result = await request<{ familyId: string }>(`/api/invitations/${encodeURIComponent(code)}/accept`, {
    method: "POST",
  });
  return result.familyId;
};

export const saveMember = async (familyId: string, input: MemberInput, memberId?: string): Promise<void> => {
  await request(
    memberId ? `/api/families/${familyId}/members/${memberId}` : `/api/families/${familyId}/members`,
    {
      method: memberId ? "PATCH" : "POST",
      body: JSON.stringify(input),
    },
  );
};

export const deleteMember = async (familyId: string, memberId: string): Promise<void> => {
  await request(`/api/families/${familyId}/members/${memberId}`, { method: "DELETE" });
};

export const linkCurrentUser = async (
  familyId: string,
  memberId: string | null,
): Promise<{ linkedMemberId: string | null; status: "approved" | "pending" }> => {
  return request(`/api/families/${familyId}/me`, {
    method: "PATCH",
    body: JSON.stringify({ memberId }),
  });
};

export interface MemberLinkRequest {
  id: string;
  userId: string;
  memberId: string;
  memberName: string;
  memberNickName?: string | null;
  userName?: string | null;
  createdAt: string;
}

export const listMemberLinkRequests = async (familyId: string): Promise<MemberLinkRequest[]> => {
  const result = await request<{ requests: MemberLinkRequest[] }>(`/api/families/${familyId}/member-link-requests`);
  return result.requests;
};

export const decideMemberLinkRequest = async (
  familyId: string,
  requestId: string,
  status: "approved" | "rejected",
): Promise<void> => {
  await request(`/api/families/${familyId}/member-link-requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
};

export const leaveFamily = async (familyId: string): Promise<void> => {
  await request(`/api/families/${familyId}/me`, { method: "DELETE" });
};

export const generateBirthdayWish = async (familyId: string, memberId: string): Promise<string> => {
  const result = await request<{ wish: string }>(
    `/api/families/${familyId}/members/${memberId}/birthday-wish`,
    { method: "POST" },
  );
  return result.wish;
};
