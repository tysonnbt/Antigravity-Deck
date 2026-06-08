// === Auto-scan policy — what the scanner is allowed to invoke ===
//
// The scanner AUTO-CALLS:
//   - Tier 1/2: methods classified `safe` (read-only) by ../test/lib/safety.js.
//   - Tier 3  : an explicit sandbox cascade sequence on a THROWAWAY conversation.
//   - Tier 4  : ONLY the curated reversible echo-back pairs below.
//
// It NEVER auto-calls anything in DESTRUCTIVE — even in aggressive mode, even if
// a method were mis-classified safe. This is the hard backstop.

// Process control, deletion, auth, IDE-disrupting, and irreversible creators.
const DESTRUCTIVE = new Set([
    'Exit', 'Restart', 'SimulateSegFault', 'ReconnectExtensionServer',
    'DeleteFileOrDirectory', 'WriteFile',
    'DeleteProject', 'DeleteMediaArtifact', 'DeletePlugin', 'DeleteWorktree',
    'DeleteCascadeMemory', 'DeleteQueuedUserInputStep', 'DeleteCascadeTrajectory',
    'RemoveTrackedWorkspace', 'AddTrackedWorkspace',
    'AuthLogout', 'LoginWithBrowser', 'ResetOnboarding', 'SkipOnboarding',
    'AcceptTermsOfService', 'MigrateApiKey', 'ImportFromCursor', 'ImportProjectFromUrl',
    'CreateWorktree', 'CheckoutWorktree', 'CreateCitcWorkspace', 'CreateProject',
    'UpdateProject', 'CreateScratchProjectFolder', 'SetupUniversitySandbox',
    'StartScreenRecording', 'SaveScreenRecording', 'HandleScreenRecording',
    'ForceStopCascadeTree', 'RevertToCascadeStep', 'ForkConversation',
    'StartBattleMode', 'EndBattleMode', 'SetCloudCodeURL', 'SetOrVerifyStaticConfig',
    'SetBaseExperiments', 'UpdateDevExperiments', 'UpdateEnterpriseExperimentsFromUrl',
    'OpenUrl', 'SmartOpenBrowser', 'AddToBrowserWhitelist', 'GenerateSkillInstallationCL',
    'CreateCustomizationFile', 'UpdateCustomizationPathsFile', 'CreateTrajectoryShare',
]);

// Reversible Get/Set pairs: read current value, write it back unchanged. Net
// state is unchanged but the request/response shape of the Set* is captured.
const ECHO_BACK = Object.freeze({
    SetUserSettings: { read: 'GetUserSettings' },
    SetUserInfo: { read: 'FetchUserInfo' },
    SetBrowserOpenConversation: { read: 'GetBrowserOpenConversation' },
    SetWorkingDirectories: { read: 'GetWorkingDirectories' },
});

function isDestructive(method) {
    return DESTRUCTIVE.has(method);
}

module.exports = { DESTRUCTIVE, ECHO_BACK, isDestructive };
