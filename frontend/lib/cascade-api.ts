// === Cascade API Client ===
import { API_BASE } from './config';
import { authHeaders } from './auth';
import type { Step } from './types';

export interface Workspace {
    pid: string;
    workspaceId: string;
    workspaceName: string;
    workspaceFolderUri: string;
    category: 'workspace' | 'playground';
    port: number;
}

export interface WorkspaceResources {
    cpuPercent: number;
    memBytes: number;
    memMB: number;
    name?: string;
}

export interface SystemResources {
    cpuPercent: number;
    memUsedMB: number;
    memTotalMB: number;
    memPercent: number;
    cpuCores: number;
}

export interface ResourceHistoryPoint {
    t: number;
    cpu: number;
    mem: number;
}

export interface ResourceSnapshot {
    system: SystemResources;
    selfStats: SelfStats;
    workspaces: Record<string, WorkspaceResources>;
    history: ResourceHistoryPoint[];
}

export interface SelfProcessStats {
    pid: number | null;
    cpuPercent: number;
    memMB: number;
}

export interface SelfStats {
    backend: SelfProcessStats;
    frontend: SelfProcessStats;
    totalCpuPercent: number;
    totalMemMB: number;
}

export interface CascadeModel {
    label: string;
    modelId: string;
    supportsImages: boolean;
    isRecommended: boolean;
    isBeta?: boolean;
    tagTitle?: string;        // short badge shown in the IDE picker, e.g. "Fast"
    tagDescription?: string;  // badge tooltip, e.g. "Limited time"
    quota: number; // 0-1 fraction remaining
    resetTime?: string | null;
}

// A display section mirroring the Antigravity IDE model picker (from clientModelSorts).
// `name` is the section header (e.g. "Recommended"); empty string means render no header.
export interface CascadeModelGroup {
    name: string;
    models: CascadeModel[];
}

export interface CascadeSendResponse {
    status: number;
    data: string;
}

export interface CascadeSubmitResponse {
    cascadeId: string;
    result: CascadeSendResponse;
}

export interface WorkspaceFolder {
    name: string;
    path: string;
    uri: string;
    open: boolean;
    wsName: string | null;
}

export interface AppSettings {
    defaultWorkspaceRoot: string;
    defaultModel: string;
    [key: string]: unknown;
}

// Media item for multi-image support (matches LS API SaveMediaAsArtifact / SendUserCascadeMessage)
export interface MediaItem {
    mimeType: string;
    inlineData: string;   // base64
    uri?: string;         // returned by SaveMediaAsArtifact
    thumbnail?: string;   // base64 thumbnail (downscaled)
}

// Save a media file via SaveMediaAsArtifact (returns uri for later reference)
export async function saveMedia(mimeType: string, inlineData: string, thumbnail?: string): Promise<{ uri?: string }> {
    const res = await fetch(`${API_BASE}/api/media/save`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ mimeType, inlineData, thumbnail: thumbnail || '' }),
    });
    if (!res.ok) throw new Error(`SaveMedia failed: ${res.status}`);
    return res.json();
}

// Send a message to an existing cascade (supports optional multi-image)
export async function cascadeSend(cascadeId: string, message: string, modelId?: string, images?: MediaItem[]): Promise<CascadeSendResponse> {
    const res = await fetch(`${API_BASE}/api/cascade/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ cascadeId, message, modelId, images }),
    });
    if (!res.ok) throw new Error(`Send failed: ${res.status}`);
    return res.json();
}

// Start a new cascade and send a message in one call
export async function cascadeSubmit(message: string, modelId?: string, images?: MediaItem[], workspace?: string, workspaceUri?: string): Promise<CascadeSubmitResponse> {
    const res = await fetch(`${API_BASE}/api/cascade/submit`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message, modelId, images, workspace, workspaceUri }),
    });
    if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
    return res.json();
}

// List all detected workspaces
export async function getWorkspaces(): Promise<Workspace[]> {
    const res = await fetch(`${API_BASE}/api/workspaces`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Workspaces failed: ${res.status}`);
    return res.json();
}

// Get CPU/RAM resource stats for all workspace PIDs
export async function getWorkspaceResources(): Promise<ResourceSnapshot> {
    const res = await fetch(`${API_BASE}/api/workspaces/resources`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Resources failed: ${res.status}`);
    return res.json();
}


// Create/open a workspace — accepts { name } or { path }
export async function createWorkspace(nameOrPath: string, isName = false): Promise<{ created: boolean; alreadyOpen?: boolean; workspace?: { pid: string; workspaceName: string; port: number }; message?: string }> {
    const res = await fetch(`${API_BASE}/api/workspaces/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(isName ? { name: nameOrPath } : { path: nameOrPath }),
    });
    if (!res.ok) throw new Error(`Create failed: ${res.status}`);
    return res.json();
}

// Kill all Antigravity IDE processes
export async function killIde(): Promise<{ killed: boolean; platform: string; instancesCleared: number }> {
    const res = await fetch(`${API_BASE}/api/kill-ide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    if (!res.ok) throw new Error(`Kill IDE failed: ${res.status}`);
    return res.json();
}

// List folders in default workspace root
export async function getWorkspaceFolders(): Promise<{ root: string; folders: WorkspaceFolder[] }> {
    const res = await fetch(`${API_BASE}/api/workspaces/folders`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Folders failed: ${res.status}`);
    return res.json();
}

// Settings
export async function getSettings(): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/api/settings`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Settings failed: ${res.status}`);
    return res.json();
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`Settings update failed: ${res.status}`);
    return res.json();
}

// Get available cascade models. `groups` mirrors the Antigravity IDE picker's
// sections/order; `models` is the same set flattened (backward compatible).
export async function getModels(): Promise<{ models: CascadeModel[]; groups: CascadeModelGroup[]; defaultModel: string }> {
    const res = await fetch(`${API_BASE}/api/models`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Models failed: ${res.status}`);
    return res.json();
}

// Cancel an active cascade invocation
export async function cascadeCancel(cascadeId: string): Promise<object> {
    const res = await fetch(`${API_BASE}/api/cascade/${cascadeId}/cancel`, { method: 'POST', headers: authHeaders() });
    if (!res.ok) throw new Error(`Cancel failed: ${res.status}`);
    return res.json();
}

// Accept or reject pending code changes
export async function cascadeInteract(cascadeId: string, action: 'accept' | 'reject' = 'accept'): Promise<object> {
    const res = await fetch(`${API_BASE}/api/cascade/${cascadeId}/accept`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action })
    });
    if (!res.ok) throw new Error(`Interact failed: ${res.status}`);
    return res.json();
}

// Gate options for the current WAITING interaction (dynamic, computed server-side to
// mirror what the Antigravity IDE would show).
export interface GateOption {
    id: string;
    label: string;
    payload: Record<string, unknown>;
}
export interface PermissionGateInfo {
    kind: 'permission';
    action: string;
    actionLabel: string;
    target: string;
    editableTarget: boolean;
    title: string;
    reason: string;
    options: GateOption[];
    denyWriteIn: { label: string; placeholder: string };
}
export type GateInfo =
    | PermissionGateInfo
    | { kind: 'askQuestion' | 'elicitation' | 'filePermission'; spec: Record<string, unknown> }
    | { kind: null };

export async function fetchGate(cascadeId: string): Promise<GateInfo> {
    const res = await fetch(`${API_BASE}/api/cascade/${cascadeId}/gate`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Gate fetch failed: ${res.status}`);
    return res.json();
}

// Get cascade run status
export interface CascadeStatus {
    cascadeId: string;
    status: string;
    stepCount: number;
    summary: string;
    lastModifiedTime?: string;
}

export async function getCascadeStatus(cascadeId: string): Promise<CascadeStatus> {
    const res = await fetch(`${API_BASE}/api/cascade/${cascadeId}/status`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Status failed: ${res.status}`);
    return res.json();
}

// Auto-accept (server-side toggle for instant reaction)
export async function getAutoAcceptState(): Promise<{ enabled: boolean }> {
    const res = await fetch(`${API_BASE}/api/auto-accept`, { headers: authHeaders() });
    return res.json();
}

export async function setAutoAcceptState(enabled: boolean): Promise<{ enabled: boolean }> {
    const res = await fetch(`${API_BASE}/api/auto-accept`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ enabled }),
    });
    return res.json();
}

// Clear cache for a specific conversation (forces full re-fetch)
export async function clearConversationCache(cascadeId: string): Promise<{ cleared: boolean }> {
    const res = await fetch(`${API_BASE}/api/cache/${cascadeId}`, { method: 'DELETE', headers: authHeaders() });
    return res.json();
}

// Read file content from disk (for code change viewer)
export async function readFile(filePath: string): Promise<{ content: string; path: string }> {
    const res = await fetch(`${API_BASE}/api/file/read`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ path: filePath }),
    });
    if (!res.ok) throw new Error(`Read failed: ${res.status}`);
    return res.json();
}

// === Git Source Control ===
export interface GitFileStatus {
    path: string;
    status: string;
    statusCode: string;
    additions: number;
    deletions: number;
}

export async function getGitStatus(workspace: string): Promise<{ files: GitFileStatus[]; error?: string }> {
    const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspace)}/git/status`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Git status failed: ${res.status}`);
    return res.json();
}

export async function getGitDiff(workspace: string, file?: string): Promise<{ diff: string }> {
    const url = file
        ? `${API_BASE}/api/workspaces/${encodeURIComponent(workspace)}/git/diff?file=${encodeURIComponent(file)}`
        : `${API_BASE}/api/workspaces/${encodeURIComponent(workspace)}/git/diff`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Git diff failed: ${res.status}`);
    return res.json();
}

export async function getGitShow(workspace: string, file: string): Promise<{ content: string | null; error?: string }> {
    const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspace)}/git/show?file=${encodeURIComponent(file)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Git show failed: ${res.status}`);
    return res.json();
}

export async function getWorkspaceFile(workspace: string, file: string): Promise<{ content: string | null; path: string; error?: string }> {
    const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspace)}/file/read?file=${encodeURIComponent(file)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`File read failed: ${res.status}`);
    return res.json();
}

// === Workflows (slash commands from Antigravity IDE) ===
export interface WorkflowItem {
    slash: string;
    label: string;
    description: string;
    source: 'global' | 'workspace';
}

export async function fetchWorkflows(workspace?: string): Promise<WorkflowItem[]> {
    const url = workspace
        ? `${API_BASE}/api/workflows?workspace=${encodeURIComponent(workspace)}`
        : `${API_BASE}/api/workflows`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Workflows failed: ${res.status}`);
    return res.json();
}

export async function fetchWorkflowContent(name: string, workspace?: string): Promise<{ name: string; content: string; source: string }> {
    const url = workspace
        ? `${API_BASE}/api/workflows/${encodeURIComponent(name)}?workspace=${encodeURIComponent(workspace)}`
        : `${API_BASE}/api/workflows/${encodeURIComponent(name)}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Workflow content failed: ${res.status}`);
    return res.json();
}

// === File Explorer ===
export interface FsEntry {
    name: string;
    type: 'file' | 'dir';
    size?: number;
    ext?: string;
}

export async function listWorkspaceDir(workspace: string, subpath = ''): Promise<{ entries: FsEntry[]; path: string }> {
    const url = `${API_BASE}/api/workspaces/${encodeURIComponent(workspace)}/fs/list${subpath ? `?path=${encodeURIComponent(subpath)}` : ''}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Dir list failed: ${res.status}`);
    return res.json();
}

// Load older steps for scroll-up pagination (binary protobuf on backend)
export async function loadOlderSteps(
    conversationId: string
): Promise<{ steps: Step[]; baseIndex: number; hasMore: boolean }> {
    const res = await fetch(
        `${API_BASE}/api/conversations/${conversationId}/steps/older`,
        { headers: authHeaders() }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// === Profile Swap ===
export interface ProfileMeta {
    userName?: string | null;
    email?: string | null;
    tier?: string | null;
    plan?: string | null;
    savedAt?: string | null;
}

export interface ProfileEntry {
    name: string;
    meta: ProfileMeta | null;
}

export interface ProfileListResponse {
    profiles: ProfileEntry[];
    active: string | null;
}

export async function getProfiles(): Promise<ProfileListResponse> {
    const res = await fetch(`${API_BASE}/api/profiles`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Profiles failed: ${res.status}`);
    return res.json();
}

export async function swapProfile(target: string): Promise<{ success: boolean; previousProfile: string; activeProfile: string; relaunched: boolean }> {
    const res = await fetch(`${API_BASE}/api/profiles/swap`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProfile: target }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Swap failed: ${res.status}`); }
    return res.json();
}

export async function autoOnboardProfile(): Promise<{ created?: boolean; skipped?: boolean; message: string; autoName?: string; active?: string }> {
    const res = await fetch(`${API_BASE}/api/profiles/auto-onboard`, {
        method: 'POST', headers: authHeaders(),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Onboard failed: ${res.status}`); }
    return res.json();
}

export async function createProfileEntry(name: string, force = false): Promise<{ created: boolean; copied: number; message: string; warning?: string }> {
    const res = await fetch(`${API_BASE}/api/profiles/create`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, force }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Create failed: ${res.status}`); }
    return res.json();
}

export async function deleteProfileEntry(name: string): Promise<{ deleted: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(name)}`, {
        method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Delete failed: ${res.status}`); }
    return res.json();
}

export async function startAddAccountFlow(): Promise<{ success: boolean; previousProfile: string; relaunched: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/api/profiles/add-account`, {
        method: 'POST', headers: authHeaders(),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Start add failed: ${res.status}`); }
    return res.json();
}

export async function cancelAddAccountFlow(previousProfile: string): Promise<{ success: boolean; activeProfile: string; relaunched: boolean }> {
    const res = await fetch(`${API_BASE}/api/profiles/cancel-add`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousProfile }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Cancel add failed: ${res.status}`); }
    return res.json();
}

// === LS API Proxy ===
// Generic helper for proxied LS calls: POST /api/ls/:method (relative path — uses Next.js rewrite).
export async function lsCall<T = unknown>(method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`/api/ls/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
        signal,
    });
    if (!res.ok) throw new Error(`LS ${method} failed: ${res.status}`);
    return res.json();
}

