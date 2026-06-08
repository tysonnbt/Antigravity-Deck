# Antigravity LS — API Diff & Test Report

_Generated: 2026-06-08T05:07:56.766Z_

## Run context

- Mode: **safe-replay only (default)**
- Live LS: connected via `detector` (port 50934, https)
- Unsafe replay: disabled
- Methods: discovered=237, deck-known=30, total=246
- Safety: safe=96, unsafe=69, unknown=81
- Schema source: `tools/api-tracker/schema/descriptors.json`, target service: `LanguageServerService`
- Services in descriptors (22): LanguageServerService(237), IssueTracker(134), ApiServerService(114), ExtensionServerService(53), KnowledgeBaseService(20), IndexManagementService(19), JetskiService(15), Cog(9), Piper(8), AnalyticsService(7), Fig(5), Buganizer(4), …

## Diff summary

| Category | Count |
| --- | ---: |
| NEW (live, not in Deck) | 216 |
| REMOVED (Deck uses, live 404/501) | 3 |
| CHANGED (response shape differs) | 0 |
| Deck-only, unverified | 6 |
| Present in both | 21 |

## NEW methods (live exposes, Deck does not call)

| Method | Safety | Replay result |
| --- | --- | --- |
| `AcceptTermsOfService` | **unsafe** | skipped-unsafe |
| `AcknowledgeCascadeCodeEdit` | unknown | skipped-unsafe |
| `AcknowledgeCodeActionStep` | unknown | skipped-unsafe |
| `AddEnvironmentToProject` | **unsafe** | skipped-unsafe |
| `AddToBrowserWhitelist` | **unsafe** | skipped-unsafe |
| `AuthLogout` | unknown | skipped-unsafe |
| `BrowserValidateCascadeOrCancelOverlay` | unknown | skipped-unsafe |
| `CancelCascadeSteps` | **unsafe** | skipped-unsafe |
| `CaptureConsoleLogs` | unknown | skipped-unsafe |
| `CaptureScreenshot` | unknown | skipped-unsafe |
| `CheckDevToolsActivePort` | safe | pass (200) |
| `CheckoutWorktree` | **unsafe** | skipped-unsafe |
| `CompleteMcpOAuth` | unknown | skipped-unsafe |
| `ConvertTrajectoryToMarkdown` | unknown | skipped-unsafe |
| `CopyBuiltinWorkflowToWorkspace` | unknown | skipped-unsafe |
| `CreateCitcWorkspace` | **unsafe** | skipped-unsafe |
| `CreateCustomizationFile` | **unsafe** | skipped-unsafe |
| `CreateProject` | **unsafe** | skipped-unsafe |
| `CreateScratchProjectFolder` | **unsafe** | skipped-unsafe |
| `CreateTrajectoryShare` | **unsafe** | skipped-unsafe |
| `CreateWorktree` | **unsafe** | skipped-unsafe |
| `DeleteAgentMessage` | **unsafe** | skipped-unsafe |
| `DeleteCascadeMemory` | **unsafe** | skipped-unsafe |
| `DeleteFileOrDirectory` | **unsafe** | skipped-unsafe |
| `DeleteMediaArtifact` | **unsafe** | skipped-unsafe |
| `DeletePlugin` | **unsafe** | skipped-unsafe |
| `DeleteProject` | **unsafe** | skipped-unsafe |
| `DeleteQueuedUserInputStep` | **unsafe** | skipped-unsafe |
| `DeleteWorktree` | **unsafe** | skipped-unsafe |
| `DisconnectMcpOAuth` | unknown | skipped-unsafe |
| `DownloadBuildWithGooglePlugin` | unknown | skipped-unsafe |
| `DumpFlightRecorder` | unknown | skipped-unsafe |
| `DumpPprof` | unknown | skipped-unsafe |
| `EndAudioSession` | unknown | skipped-unsafe |
| `EndBattleMode` | unknown | skipped-unsafe |
| `Exit` | unknown | skipped-unsafe |
| `FetchUserInfo` | safe | pass (200) |
| `FocusUserPage` | unknown | skipped-unsafe |
| `ForceBackgroundResearchRefresh` | unknown | skipped-unsafe |
| `ForceStopCascadeTree` | unknown | skipped-unsafe |
| `ForkConversation` | unknown | skipped-unsafe |
| `GenerateCommitMessage` | unknown | skipped-unsafe |
| `GenerateEnvironmentName` | unknown | skipped-unsafe |
| `GenerateSkillInstallationCL` | unknown | skipped-unsafe |
| `GetAgentScripts` | safe | pass (200) |
| `GetAgentTeamMetadata` | safe | reached-error (400) |
| `GetAllBrowserWhitelistedUrls` | safe | reached-error (500) |
| `GetAllCustomAgentConfigs` | safe | reached-error (500) |
| `GetAllPlugins` | safe | pass (200) |
| `GetAllRules` | safe | pass (200) |
| `GetAllSkills` | safe | pass (200) |
| `GetAllWorkflows` | safe | pass (200) |
| `GetArtifactSnapshots` | safe | reached-error (500) |
| `GetAuthStatus` | safe | pass (200) |
| `GetAvailableModels` | safe | pass (200) |
| `GetBrowserOpenConversation` | safe | reached-error (500) |
| `GetBrowserWhitelistFilePath` | safe | reached-error (500) |
| `GetBuildWithGooglePlugins` | safe | pass (200) |
| `GetCascadeMemories` | safe | reached-error (500) |
| `GetCascadeModelConfigs` | safe | pass (200) |
| `GetCascadeNuxes` | safe | pass (200) |
| `GetCascadePluginById` | safe | pass (200) |
| `GetCascadeTrajectoryExecutorMetadatas` | safe | reached-error (500) |
| `GetChangelog` | safe | reached-error (500) |
| `GetCodeFrequencyForRepo` | safe | reached-error (400) |
| `GetCodeValidationStates` | safe | reached-error (500) |
| `GetCommandModelConfigs` | safe | removed (501) |
| `GetConversationMetadata` | safe | reached-error (400) |
| `GetDebugDiagnostics` | safe | pass (200) |
| `GetDefaultProjectDir` | safe | pass (200) |
| `GetGrantedScopes` | safe | pass (200) |
| `GetKnowledgeItems` | safe | pass (200) |
| `GetLoadCodeAssist` | safe | pass (200) |
| `GetLocalUserInfo` | safe | pass (200) |
| `GetMatchingContextScopeItems` | safe | pass (200) |
| `GetMcpPrompt` | safe | reached-error (500) |
| `GetMcpServerStates` | safe | pass (200) |
| `GetMcpServerTemplates` | safe | pass (200) |
| `GetMendelFlags` | safe | pass (200) |
| `GetModelResponse` | safe | reached-error (500) |
| `GetModelStatuses` | safe | pass (200) |
| `GetPatchAndCodeChange` | safe | reached-error (500) |
| `GetRepoInfos` | safe | pass (200) |
| `GetRevertPreview` | safe | reached-error (400) |
| `GetRevisionArtifact` | safe | reached-error (400) |
| `GetSidecarEvents` | safe | pass (200) |
| `GetSidecarLogs` | safe | needs-streaming (415) |
| `GetSidecars` | safe | pass (200) |
| `GetSkillMarketplaceLink` | safe | removed (501) |
| `GetSlashCommands` | safe | reached-error (500) |
| `GetStandaloneDir` | safe | pass (200) |
| `GetStaticExperimentStatus` | safe | pass (200) |
| `GetStatus` | safe | pass (200) |
| `GetTeamOrganizationalControls` | safe | pass (200) |
| `GetTermsOfService` | safe | reached-error (500) |
| `GetTokenBase` | safe | pass (200) |
| `GetTranscription` | safe | pass (200) |
| `GetTurnDiff` | safe | reached-error (400) |
| `GetUnleashData` | safe | pass (200) |
| `GetUserAnalyticsSummary` | safe | pass (200) |
| `GetUserMemories` | safe | reached-error (500) |
| `GetUserSettings` | safe | removed (501) |
| `GetUserTrajectory` | safe | removed (404) |
| `GetUserTrajectoryDebug` | safe | pass (200) |
| `GetUserTrajectoryDescriptions` | safe | pass (200) |
| `GetWebDocsOptions` | safe | pass (200) |
| `GetWorkingDirectories` | safe | pass (200) |
| `GetWorkspaceEditState` | safe | pass (200) |
| `GetWorktreeDiff` | safe | reached-error (400) |
| `HandleScreenRecording` | **unsafe** | skipped-unsafe |
| `HandleStreamingCommand` | **unsafe** | skipped-unsafe |
| `HasAuthToken` | unknown | skipped-unsafe |
| `Heartbeat` | unknown | skipped-unsafe |
| `ImportFromCursor` | unknown | skipped-unsafe |
| `ImportProjectFromUrl` | unknown | skipped-unsafe |
| `InitializeCascadePanelState` | unknown | skipped-unsafe |
| `JetboxDeleteSummary` | unknown | skipped-unsafe |
| `JetboxGetLatestVersion` | unknown | skipped-unsafe |
| `JetboxSubscribeToGcertState` | unknown | skipped-unsafe |
| `JetboxSubscribeToOAuthState` | unknown | skipped-unsafe |
| `JetboxSubscribeToState` | unknown | skipped-unsafe |
| `JetboxSubscribeToSummaries` | unknown | skipped-unsafe |
| `JetboxWriteState` | **unsafe** | skipped-unsafe |
| `JetboxWriteSummary` | **unsafe** | skipped-unsafe |
| `ListCustomizationPathsByFile` | safe | reached-error (500) |
| `ListMcpPrompts` | safe | pass (200) |
| `ListMcpResources` | safe | pass (200) |
| `ListPages` | safe | pass (200) |
| `ListSidecarLogFiles` | safe | reached-error (500) |
| `LoadReplayConversation` | unknown | skipped-unsafe |
| `LoadTrajectory` | unknown | skipped-unsafe |
| `LoginWithBrowser` | unknown | skipped-unsafe |
| `ManageSidecar` | unknown | skipped-unsafe |
| `MigrateApiKey` | unknown | skipped-unsafe |
| `OpenUrl` | unknown | skipped-unsafe |
| `ProjectUpdatesStream` | unknown | skipped-unsafe |
| `ProvideCompletionFeedback` | unknown | skipped-unsafe |
| `ReadDir` | safe | reached-error (500) |
| `ReadFile` | safe | reached-error (500) |
| `ReadProject` | safe | reached-error (400) |
| `ReconnectExtensionServer` | unknown | skipped-unsafe |
| `RecordAnalyticsEvent` | **unsafe** | skipped-unsafe |
| `RecordChatFeedback` | unknown | skipped-unsafe |
| `RecordChatPanelSession` | unknown | skipped-unsafe |
| `RecordCommitMessageSave` | unknown | skipped-unsafe |
| `RecordError` | unknown | skipped-unsafe |
| `RecordEvent` | unknown | skipped-unsafe |
| `RecordInteractiveCascadeFeedback` | unknown | skipped-unsafe |
| `RecordLints` | unknown | skipped-unsafe |
| `RecordObservabilityData` | unknown | skipped-unsafe |
| `RecordSearchDocOpen` | unknown | skipped-unsafe |
| `RecordSearchResultsView` | unknown | skipped-unsafe |
| `RecordSidecarEvent` | unknown | skipped-unsafe |
| `RecordUserGrep` | unknown | skipped-unsafe |
| `RecordUserStepSnapshot` | unknown | skipped-unsafe |
| `RefreshContextForIdeAction` | **unsafe** | skipped-unsafe |
| `RefreshMcpServers` | **unsafe** | skipped-unsafe |
| `RegisterGdmUser` | unknown | skipped-unsafe |
| `RegisterInteraction` | unknown | skipped-unsafe |
| `RemoveTrackedWorkspace` | **unsafe** | skipped-unsafe |
| `ReplayGroundTruthTrajectory` | unknown | skipped-unsafe |
| `RequestAgentStatePageUpdate` | unknown | skipped-unsafe |
| `ResetOnboarding` | unknown | skipped-unsafe |
| `ResolveFolder` | unknown | skipped-unsafe |
| `ResolveOutstandingSteps` | unknown | skipped-unsafe |
| `ResolveWorkspaceUrlPreview` | unknown | skipped-unsafe |
| `Restart` | **unsafe** | skipped-unsafe |
| `RevertToCascadeStep` | unknown | skipped-unsafe |
| `RunCommand` | **unsafe** | skipped-unsafe |
| `SaveAgentScriptCommandSpec` | **unsafe** | skipped-unsafe |
| `SaveScreenRecording` | **unsafe** | skipped-unsafe |
| `ScanSkillsConfigFile` | unknown | skipped-unsafe |
| `SearchCode` | safe | pass (200) |
| `SearchConversations` | safe | pass (200) |
| `SearchFiles` | safe | pass (200) |
| `SendActionToChatPanel` | **unsafe** | skipped-unsafe |
| `SendAgentMessage` | **unsafe** | skipped-unsafe |
| `SendAllQueuedMessages` | **unsafe** | skipped-unsafe |
| `SendAudioChunk` | **unsafe** | skipped-unsafe |
| `SendStepsToBackground` | **unsafe** | skipped-unsafe |
| `SetBaseExperiments` | **unsafe** | skipped-unsafe |
| `SetBrowserOpenConversation` | **unsafe** | skipped-unsafe |
| `SetCloudCodeURL` | **unsafe** | skipped-unsafe |
| `SetOrVerifyStaticConfig` | **unsafe** | skipped-unsafe |
| `SetUserInfo` | **unsafe** | skipped-unsafe |
| `SetUserSettings` | **unsafe** | skipped-unsafe |
| `SetWorkingDirectories` | **unsafe** | skipped-unsafe |
| `SetupUniversitySandbox` | **unsafe** | skipped-unsafe |
| `ShouldEnableUnleash` | unknown | skipped-unsafe |
| `SignalExecutableIdle` | unknown | skipped-unsafe |
| `SimulateSegFault` | unknown | skipped-unsafe |
| `SkipBrowserSubagent` | unknown | skipped-unsafe |
| `SkipOnboarding` | unknown | skipped-unsafe |
| `SmartFocusConversation` | unknown | skipped-unsafe |
| `SmartOpenBrowser` | unknown | skipped-unsafe |
| `StartBattleMode` | **unsafe** | skipped-unsafe |
| `StartScreenRecording` | **unsafe** | skipped-unsafe |
| `StatUri` | safe | reached-error (500) |
| `StreamAgentStateUpdates` | safe | needs-streaming (415) |
| `StreamAudioTranscription` | unknown | skipped-unsafe |
| `StreamUserTrajectoryReactiveUpdates` | safe | needs-streaming (415) |
| `SubscribeToSidecars` | unknown | skipped-unsafe |
| `ToggleMcpServer` | unknown | skipped-unsafe |
| `UpdateCascadeMemory` | **unsafe** | skipped-unsafe |
| `UpdateConversationAnnotations` | **unsafe** | skipped-unsafe |
| `UpdateCustomization` | **unsafe** | skipped-unsafe |
| `UpdateCustomizationPathsFile` | **unsafe** | skipped-unsafe |
| `UpdateDevExperiments` | **unsafe** | skipped-unsafe |
| `UpdateEnterpriseExperimentsFromUrl` | **unsafe** | skipped-unsafe |
| `UpdatePRForWorktree` | **unsafe** | skipped-unsafe |
| `UpdateProject` | **unsafe** | skipped-unsafe |
| `ValidateProject` | unknown | skipped-unsafe |
| `WaitForConversationFullyIdle` | unknown | skipped-unsafe |
| `WatchDirectory` | unknown | skipped-unsafe |
| `WellSupportedLanguages` | unknown | skipped-unsafe |
| `WriteFile` | **unsafe** | skipped-unsafe |

## REMOVED methods (Deck calls, live LS returned unimplemented)

| Method | Status |
| --- | --- |
| `GetSettings` | 404 |
| `GetSubscriptionStatus` | 404 |
| `GetWorkspaceFolders` | 404 |

## Schema-declared but unimplemented on this LS build

_In the proto descriptors but the live LS returned 404/501. Not a Deck regression — the Deck does not call these — but documents which schema surface this build does not serve._

| Method | Status |
| --- | --- |
| `GetCommandModelConfigs` | 501 |
| `GetSkillMarketplaceLink` | 501 |
| `GetUserSettings` | 501 |
| `GetUserTrajectory` | 404 |

## CHANGED methods (response shape differs: captured vs live)

_None detected._
## Deck-only (unverified against live)

_These are in the Deck inventory but were not seen in capture/schema and were not replayed (or replay was skipped). Not necessarily removed._

- `AcceptDiff` (**unsafe**)
- `RejectDiff` (**unsafe**)
- `SendCascadeMessage` (**unsafe**)
- `StartCascadeInvocation` (**unsafe**)
- `UninstallCascadePlugin` (**unsafe**)
- `UpdateSettings` (**unsafe**)

## Per-method replay results

| Method | Safety | Result | Status | Decode | Bytes | Detail |
| --- | --- | --- | ---: | --- | ---: | --- |
| `AcceptDiff` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `AcceptTermsOfService` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `AcknowledgeCascadeCodeEdit` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `AcknowledgeCodeActionStep` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `AddEnvironmentToProject` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `AddToBrowserWhitelist` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `AddTrackedWorkspace` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `AuthLogout` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `BrowserValidateCascadeOrCancelOverlay` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CancelCascadeInvocation` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CancelCascadeSteps` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CaptureConsoleLogs` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CaptureScreenshot` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CheckDevToolsActivePort` | safe | pass | 200 | json✓ | 2 | decoded json |
| `CheckoutWorktree` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CompleteMcpOAuth` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ConvertTrajectoryToMarkdown` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CopyBuiltinWorkflowToWorkspace` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CreateCitcWorkspace` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CreateCustomizationFile` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CreateProject` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CreateScratchProjectFolder` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CreateTrajectoryShare` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `CreateWorktree` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteAgentMessage` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteCascadeMemory` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteCascadeTrajectory` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteFileOrDirectory` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteMediaArtifact` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeletePlugin` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteProject` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteQueuedUserInputStep` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DeleteWorktree` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DisconnectMcpOAuth` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DownloadBuildWithGooglePlugin` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DumpFlightRecorder` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `DumpPprof` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `EndAudioSession` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `EndBattleMode` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `Exit` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `FetchUserInfo` | safe | pass | 200 | json✓ | 42 | decoded json |
| `FocusUserPage` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ForceBackgroundResearchRefresh` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ForceStopCascadeTree` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ForkConversation` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `GenerateCommitMessage` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `GenerateEnvironmentName` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `GenerateSkillInstallationCL` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `GetAgentScripts` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetAgentTeamMetadata` | safe | reached-error | 400 | json✓ | 82 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `GetAllBrowserWhitelistedUrls` | safe | reached-error | 500 | json✓ | 78 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetAllCascadeTrajectories` | safe | pass | 200 | json✓ | 1421 | decoded json |
| `GetAllCustomAgentConfigs` | safe | reached-error | 500 | json✓ | 41 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetAllPlugins` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetAllRules` | safe | pass | 200 | json✓ | 208 | decoded json |
| `GetAllSkills` | safe | pass | 200 | json✓ | 11492500 | decoded json |
| `GetAllWorkflows` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetArtifactSnapshots` | safe | reached-error | 500 | json✓ | 57 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetAuthStatus` | safe | pass | 200 | json✓ | 356 | decoded json |
| `GetAvailableCascadePlugins` | safe | pass | 200 | json✓ | 50066 | decoded json |
| `GetAvailableModels` | safe | pass | 200 | json✓ | 66756 | decoded json |
| `GetBrowserOpenConversation` | safe | reached-error | 500 | json✓ | 114 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetBrowserWhitelistFilePath` | safe | reached-error | 500 | json✓ | 77 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetBuildWithGooglePlugins` | safe | pass | 200 | json✓ | 2852 | decoded json |
| `GetCascadeMemories` | safe | reached-error | 500 | json✓ | 41 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetCascadeModelConfigData` | safe | pass | 200 | json✓ | 7667 | decoded json |
| `GetCascadeModelConfigs` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetCascadeNuxes` | safe | pass | 200 | json✓ | 2042 | decoded json |
| `GetCascadePluginById` | safe | pass | 200 | json✓ | 13 | decoded json |
| `GetCascadeTrajectory` | safe | reached-error | 500 | json✓ | 51 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetCascadeTrajectoryExecutorMetadatas` | safe | reached-error | 500 | json✓ | 51 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetCascadeTrajectoryGeneratorMetadata` | safe | reached-error | 500 | json✓ | 51 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetCascadeTrajectorySteps` | safe | reached-error | 500 | json✓ | 51 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetChangelog` | safe | reached-error | 500 | json✓ | 92 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetCodeFrequencyForRepo` | safe | reached-error | 400 | json✓ | 78 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `GetCodeValidationStates` | safe | reached-error | 500 | json✓ | 51 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetCommandModelConfigs` | safe | removed | 501 | json✓ | 65 | unimplemented (HTTP 501) |
| `GetConversationMetadata` | safe | reached-error | 400 | json✓ | 85 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `GetDebugDiagnostics` | safe | pass | 200 | json✓ | 45200 | decoded json |
| `GetDefaultProjectDir` | safe | pass | 200 | json✓ | 59 | decoded json |
| `GetGrantedScopes` | safe | pass | 200 | json✓ | 333 | decoded json |
| `GetKnowledgeItems` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetLoadCodeAssist` | safe | pass | 200 | json✓ | 3311 | decoded json |
| `GetLocalUserInfo` | safe | pass | 200 | json✓ | 63 | decoded json |
| `GetMatchingContextScopeItems` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetMcpPrompt` | safe | reached-error | 500 | json✓ | 105 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetMcpServerStates` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetMcpServerTemplates` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetMendelFlags` | safe | pass | 200 | json✓ | 31187 | decoded json |
| `GetModelResponse` | safe | reached-error | 500 | json✓ | 84 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetModelStatuses` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetPatchAndCodeChange` | safe | reached-error | 500 | json✓ | 71 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetProfileData` | safe | pass | 200 | json✓ | 1022 | decoded json |
| `GetRepoInfos` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetRevertPreview` | safe | reached-error | 400 | json✓ | 80 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `GetRevisionArtifact` | safe | reached-error | 400 | json✓ | 83 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `GetSettings` | safe | removed | 404 | proto | 19 | unimplemented (HTTP 404) |
| `GetSidecarEvents` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetSidecarLogs` | safe | needs-streaming | 415 | none | 0 | rejected application/json (use gRPC-Web/proto framing for streams) |
| `GetSidecars` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetSkillMarketplaceLink` | safe | removed | 501 | json✓ | 116 | unimplemented (HTTP 501) |
| `GetSlashCommands` | safe | reached-error | 500 | json✓ | 144 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetStandaloneDir` | safe | pass | 200 | json✓ | 67 | decoded json |
| `GetStaticExperimentStatus` | safe | pass | 200 | json✓ | 9940 | decoded json |
| `GetStatus` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetSubscriptionStatus` | safe | removed | 404 | proto | 19 | unimplemented (HTTP 404) |
| `GetTeamOrganizationalControls` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetTermsOfService` | safe | reached-error | 500 | json✓ | 86 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetTokenBase` | safe | pass | 200 | json✓ | 62469 | decoded json |
| `GetTranscription` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetTurnDiff` | safe | reached-error | 400 | json✓ | 85 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `GetUnleashData` | safe | pass | 200 | json✓ | 519 | decoded json |
| `GetUserAnalyticsSummary` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetUserMemories` | safe | reached-error | 500 | json✓ | 41 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `GetUserSettings` | safe | removed | 501 | json✓ | 65 | unimplemented (HTTP 501) |
| `GetUserStatus` | safe | pass | 200 | json✓ | 8682 | decoded json |
| `GetUserTrajectory` | safe | removed | 404 | json✓ | 98 | unimplemented (HTTP 404) |
| `GetUserTrajectoryDebug` | safe | pass | 200 | json✓ | 339 | decoded json |
| `GetUserTrajectoryDescriptions` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetWebDocsOptions` | safe | pass | 200 | json✓ | 234 | decoded json |
| `GetWorkingDirectories` | safe | pass | 200 | json✓ | 2 | decoded json |
| `GetWorkspaceEditState` | safe | pass | 200 | json✓ | 23 | decoded json |
| `GetWorkspaceFolders` | safe | removed | 404 | proto | 19 | unimplemented (HTTP 404) |
| `GetWorkspaceInfos` | safe | pass | 200 | json✓ | 120 | decoded json |
| `GetWorktreeDiff` | safe | reached-error | 400 | json✓ | 121 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `HandleCascadeUserInteraction` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `HandleScreenRecording` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `HandleStreamingCommand` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `HasAuthToken` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `Heartbeat` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ImportFromCursor` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ImportProjectFromUrl` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `InitializeCascadePanelState` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `InstallCascadePlugin` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxDeleteSummary` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxGetLatestVersion` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxSubscribeToGcertState` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxSubscribeToOAuthState` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxSubscribeToState` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxSubscribeToSummaries` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxWriteState` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `JetboxWriteSummary` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ListCustomizationPathsByFile` | safe | reached-error | 500 | json✓ | 101 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `ListMcpPrompts` | safe | pass | 200 | json✓ | 2 | decoded json |
| `ListMcpResources` | safe | pass | 200 | json✓ | 2 | decoded json |
| `ListPages` | safe | pass | 200 | json✓ | 2 | decoded json |
| `ListSidecarLogFiles` | safe | reached-error | 500 | json✓ | 177 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `LoadReplayConversation` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `LoadTrajectory` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `LoginWithBrowser` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ManageSidecar` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `MigrateApiKey` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `OpenUrl` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ProjectUpdatesStream` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ProvideCompletionFeedback` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ReadDir` | safe | reached-error | 500 | json✓ | 81 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `ReadFile` | safe | reached-error | 500 | json✓ | 81 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `ReadProject` | safe | reached-error | 400 | json✓ | 72 | exists but request rejected (HTTP 400; likely missing/invalid args for empty body) |
| `ReconnectExtensionServer` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordAnalyticsEvent` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordChatFeedback` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordChatPanelSession` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordCommitMessageSave` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordError` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordEvent` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordInteractiveCascadeFeedback` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordLints` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordObservabilityData` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordSearchDocOpen` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordSearchResultsView` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordSidecarEvent` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordUserGrep` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RecordUserStepSnapshot` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RefreshContextForIdeAction` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RefreshMcpServers` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RegisterGdmUser` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RegisterInteraction` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RejectDiff` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RemoveTrackedWorkspace` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ReplayGroundTruthTrajectory` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RequestAgentStatePageUpdate` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ResetOnboarding` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ResolveFolder` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ResolveOutstandingSteps` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ResolveWorkspaceUrlPreview` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `Restart` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RevertToCascadeStep` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `RunCommand` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SaveAgentScriptCommandSpec` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SaveMediaAsArtifact` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SaveScreenRecording` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ScanSkillsConfigFile` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SearchCode` | safe | pass | 200 | json✓ | 2 | decoded json |
| `SearchConversations` | safe | pass | 200 | json✓ | 240 | decoded json |
| `SearchFiles` | safe | pass | 200 | json✓ | 2 | decoded json |
| `SendActionToChatPanel` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SendAgentMessage` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SendAllQueuedMessages` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SendAudioChunk` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SendCascadeMessage` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SendStepsToBackground` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SendUserCascadeMessage` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetBaseExperiments` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetBrowserOpenConversation` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetCloudCodeURL` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetOrVerifyStaticConfig` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetUserInfo` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetUserSettings` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetWorkingDirectories` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SetupUniversitySandbox` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ShouldEnableUnleash` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SignalExecutableIdle` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SimulateSegFault` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SkipBrowserSubagent` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SkipOnboarding` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SmartFocusConversation` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `SmartOpenBrowser` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `StartBattleMode` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `StartCascade` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `StartCascadeInvocation` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `StartScreenRecording` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `StatUri` | safe | reached-error | 500 | json✓ | 60 | exists but request rejected (HTTP 500; likely missing/invalid args for empty body) |
| `StreamAgentStateUpdates` | safe | needs-streaming | 415 | none | 0 | rejected application/json (use gRPC-Web/proto framing for streams) |
| `StreamAudioTranscription` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `StreamCascadePanelReactiveUpdates` | safe | needs-streaming | 415 | none | 0 | rejected application/json (use gRPC-Web/proto framing for streams) |
| `StreamCascadeReactiveUpdates` | safe | needs-streaming | 415 | none | 0 | rejected application/json (use gRPC-Web/proto framing for streams) |
| `StreamCascadeSummariesReactiveUpdates` | safe | needs-streaming | 415 | none | 0 | rejected application/json (use gRPC-Web/proto framing for streams) |
| `StreamTerminalShellCommand` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `StreamUserTrajectoryReactiveUpdates` | safe | needs-streaming | 415 | none | 0 | rejected application/json (use gRPC-Web/proto framing for streams) |
| `SubscribeToSidecars` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ToggleMcpServer` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UninstallCascadePlugin` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateCascadeMemory` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateConversationAnnotations` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateCustomization` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateCustomizationPathsFile` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateDevExperiments` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateEnterpriseExperimentsFromUrl` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdatePRForWorktree` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateProject` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `UpdateSettings` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `ValidateProject` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `WaitForConversationFullyIdle` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `WatchDirectory` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `WellSupportedLanguages` | unknown | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |
| `WriteFile` | **unsafe** | skipped-unsafe | — | none | 0 | skipped (mutating/unknown; not included) |

## Full method → safety classification

| Method | Safety | Source | Reason |
| --- | --- | --- | --- |
| `AcceptDiff` | **unsafe** | heuristic | Accept* — applies a proposed diff/change |
| `AcceptTermsOfService` | **unsafe** | heuristic | Accept* — applies a proposed diff/change |
| `AcknowledgeCascadeCodeEdit` | unknown | default | no rule matched — conservative default |
| `AcknowledgeCodeActionStep` | unknown | default | no rule matched — conservative default |
| `AddEnvironmentToProject` | **unsafe** | heuristic | Add* / AddTracked* — adds tracked resources |
| `AddToBrowserWhitelist` | **unsafe** | heuristic | Add* / AddTracked* — adds tracked resources |
| `AddTrackedWorkspace` | **unsafe** | heuristic | Add* / AddTracked* — adds tracked resources |
| `AuthLogout` | unknown | default | no rule matched — conservative default |
| `BrowserValidateCascadeOrCancelOverlay` | unknown | default | no rule matched — conservative default |
| `CancelCascadeInvocation` | **unsafe** | heuristic | Cancel* — interrupts a running invocation |
| `CancelCascadeSteps` | **unsafe** | heuristic | Cancel* — interrupts a running invocation |
| `CaptureConsoleLogs` | unknown | default | no rule matched — conservative default |
| `CaptureScreenshot` | unknown | default | no rule matched — conservative default |
| `CheckDevToolsActivePort` | safe | heuristic | Check* — read-only validation |
| `CheckoutWorktree` | **unsafe** | heuristic | Checkout* — checks out a worktree/branch (mutates state) |
| `CompleteMcpOAuth` | unknown | default | no rule matched — conservative default |
| `ConvertTrajectoryToMarkdown` | unknown | default | no rule matched — conservative default |
| `CopyBuiltinWorkflowToWorkspace` | unknown | default | no rule matched — conservative default |
| `CreateCitcWorkspace` | **unsafe** | heuristic | Create* — creates state |
| `CreateCustomizationFile` | **unsafe** | heuristic | Create* — creates state |
| `CreateProject` | **unsafe** | heuristic | Create* — creates state |
| `CreateScratchProjectFolder` | **unsafe** | heuristic | Create* — creates state |
| `CreateTrajectoryShare` | **unsafe** | heuristic | Create* — creates state |
| `CreateWorktree` | **unsafe** | heuristic | Create* — creates state |
| `DeleteAgentMessage` | **unsafe** | heuristic | Delete* — removes state |
| `DeleteCascadeMemory` | **unsafe** | heuristic | Delete* — removes state |
| `DeleteCascadeTrajectory` | **unsafe** | heuristic | Delete* — removes state |
| `DeleteFileOrDirectory` | **unsafe** | heuristic | Delete* — removes state |
| `DeleteMediaArtifact` | **unsafe** | heuristic | Delete* — removes state |
| `DeletePlugin` | **unsafe** | heuristic | Delete* — removes state |
| `DeleteProject` | **unsafe** | heuristic | Delete* — removes state |
| `DeleteQueuedUserInputStep` | **unsafe** | heuristic | Delete* — removes state |
| `DeleteWorktree` | **unsafe** | heuristic | Delete* — removes state |
| `DisconnectMcpOAuth` | unknown | default | no rule matched — conservative default |
| `DownloadBuildWithGooglePlugin` | unknown | default | no rule matched — conservative default |
| `DumpFlightRecorder` | unknown | default | no rule matched — conservative default |
| `DumpPprof` | unknown | default | no rule matched — conservative default |
| `EndAudioSession` | unknown | default | no rule matched — conservative default |
| `EndBattleMode` | unknown | default | no rule matched — conservative default |
| `Exit` | unknown | default | no rule matched — conservative default |
| `FetchUserInfo` | safe | heuristic | Fetch* — pure read |
| `FocusUserPage` | unknown | default | no rule matched — conservative default |
| `ForceBackgroundResearchRefresh` | unknown | default | no rule matched — conservative default |
| `ForceStopCascadeTree` | unknown | default | no rule matched — conservative default |
| `ForkConversation` | unknown | default | no rule matched — conservative default |
| `GenerateCommitMessage` | unknown | default | no rule matched — conservative default |
| `GenerateEnvironmentName` | unknown | default | no rule matched — conservative default |
| `GenerateSkillInstallationCL` | unknown | default | no rule matched — conservative default |
| `GetAgentScripts` | safe | override | explicit override |
| `GetAgentTeamMetadata` | safe | heuristic | Get* — pure read |
| `GetAllBrowserWhitelistedUrls` | safe | heuristic | Get* — pure read |
| `GetAllCascadeTrajectories` | safe | heuristic | Get* — pure read |
| `GetAllCustomAgentConfigs` | safe | heuristic | Get* — pure read |
| `GetAllPlugins` | safe | heuristic | Get* — pure read |
| `GetAllRules` | safe | heuristic | Get* — pure read |
| `GetAllSkills` | safe | heuristic | Get* — pure read |
| `GetAllWorkflows` | safe | heuristic | Get* — pure read |
| `GetArtifactSnapshots` | safe | heuristic | Get* — pure read |
| `GetAuthStatus` | safe | heuristic | Get* — pure read |
| `GetAvailableCascadePlugins` | safe | heuristic | Get* — pure read |
| `GetAvailableModels` | safe | heuristic | Get* — pure read |
| `GetBrowserOpenConversation` | safe | heuristic | Get* — pure read |
| `GetBrowserWhitelistFilePath` | safe | heuristic | Get* — pure read |
| `GetBuildWithGooglePlugins` | safe | heuristic | Get* — pure read |
| `GetCascadeMemories` | safe | heuristic | Get* — pure read |
| `GetCascadeModelConfigData` | safe | heuristic | Get* — pure read |
| `GetCascadeModelConfigs` | safe | heuristic | Get* — pure read |
| `GetCascadeNuxes` | safe | heuristic | Get* — pure read |
| `GetCascadePluginById` | safe | heuristic | Get* — pure read |
| `GetCascadeTrajectory` | safe | heuristic | Get* — pure read |
| `GetCascadeTrajectoryExecutorMetadatas` | safe | heuristic | Get* — pure read |
| `GetCascadeTrajectoryGeneratorMetadata` | safe | heuristic | Get* — pure read |
| `GetCascadeTrajectorySteps` | safe | heuristic | Get* — pure read |
| `GetChangelog` | safe | heuristic | Get* — pure read |
| `GetCodeFrequencyForRepo` | safe | heuristic | Get* — pure read |
| `GetCodeValidationStates` | safe | heuristic | Get* — pure read |
| `GetCommandModelConfigs` | safe | heuristic | Get* — pure read |
| `GetConversationMetadata` | safe | heuristic | Get* — pure read |
| `GetDebugDiagnostics` | safe | heuristic | Get* — pure read |
| `GetDefaultProjectDir` | safe | heuristic | Get* — pure read |
| `GetGrantedScopes` | safe | heuristic | Get* — pure read |
| `GetKnowledgeItems` | safe | heuristic | Get* — pure read |
| `GetLoadCodeAssist` | safe | heuristic | Get* — pure read |
| `GetLocalUserInfo` | safe | heuristic | Get* — pure read |
| `GetMatchingContextScopeItems` | safe | heuristic | Get* — pure read |
| `GetMcpPrompt` | safe | heuristic | Get* — pure read |
| `GetMcpServerStates` | safe | override | explicit override |
| `GetMcpServerTemplates` | safe | heuristic | Get* — pure read |
| `GetMendelFlags` | safe | heuristic | Get* — pure read |
| `GetModelResponse` | safe | heuristic | Get* — pure read |
| `GetModelStatuses` | safe | heuristic | Get* — pure read |
| `GetPatchAndCodeChange` | safe | heuristic | Get* — pure read |
| `GetProfileData` | safe | heuristic | Get* — pure read |
| `GetRepoInfos` | safe | override | explicit override |
| `GetRevertPreview` | safe | heuristic | Get* — pure read |
| `GetRevisionArtifact` | safe | heuristic | Get* — pure read |
| `GetSettings` | safe | heuristic | Get* — pure read |
| `GetSidecarEvents` | safe | heuristic | Get* — pure read |
| `GetSidecarLogs` | safe | heuristic | Get* — pure read |
| `GetSidecars` | safe | heuristic | Get* — pure read |
| `GetSkillMarketplaceLink` | safe | heuristic | Get* — pure read |
| `GetSlashCommands` | safe | heuristic | Get* — pure read |
| `GetStandaloneDir` | safe | override | explicit override |
| `GetStaticExperimentStatus` | safe | heuristic | Get* — pure read |
| `GetStatus` | safe | heuristic | Get* — pure read |
| `GetSubscriptionStatus` | safe | heuristic | Get* — pure read |
| `GetTeamOrganizationalControls` | safe | heuristic | Get* — pure read |
| `GetTermsOfService` | safe | heuristic | Get* — pure read |
| `GetTokenBase` | safe | heuristic | Get* — pure read |
| `GetTranscription` | safe | heuristic | Get* — pure read |
| `GetTurnDiff` | safe | override | explicit override |
| `GetUnleashData` | safe | heuristic | Get* — pure read |
| `GetUserAnalyticsSummary` | safe | heuristic | Get* — pure read |
| `GetUserMemories` | safe | heuristic | Get* — pure read |
| `GetUserSettings` | safe | heuristic | Get* — pure read |
| `GetUserStatus` | safe | heuristic | Get* — pure read |
| `GetUserTrajectory` | safe | heuristic | Get* — pure read |
| `GetUserTrajectoryDebug` | safe | heuristic | Get* — pure read |
| `GetUserTrajectoryDescriptions` | safe | heuristic | Get* — pure read |
| `GetWebDocsOptions` | safe | heuristic | Get* — pure read |
| `GetWorkingDirectories` | safe | heuristic | Get* — pure read |
| `GetWorkspaceEditState` | safe | heuristic | Get* — pure read |
| `GetWorkspaceFolders` | safe | heuristic | Get* — pure read |
| `GetWorkspaceInfos` | safe | heuristic | Get* — pure read |
| `GetWorktreeDiff` | safe | heuristic | Get* — pure read |
| `HandleCascadeUserInteraction` | **unsafe** | heuristic | Handle*Interaction — drives the agent on user input |
| `HandleScreenRecording` | **unsafe** | heuristic | Handle* — processes an interaction (side-effecting) |
| `HandleStreamingCommand` | **unsafe** | heuristic | Handle* — processes an interaction (side-effecting) |
| `HasAuthToken` | unknown | default | no rule matched — conservative default |
| `Heartbeat` | unknown | default | no rule matched — conservative default |
| `ImportFromCursor` | unknown | default | no rule matched — conservative default |
| `ImportProjectFromUrl` | unknown | default | no rule matched — conservative default |
| `InitializeCascadePanelState` | unknown | default | no rule matched — conservative default |
| `InstallCascadePlugin` | **unsafe** | heuristic | Install* — installs a plugin/extension |
| `JetboxDeleteSummary` | unknown | default | no rule matched — conservative default |
| `JetboxGetLatestVersion` | unknown | default | no rule matched — conservative default |
| `JetboxSubscribeToGcertState` | unknown | default | no rule matched — conservative default |
| `JetboxSubscribeToOAuthState` | unknown | default | no rule matched — conservative default |
| `JetboxSubscribeToState` | unknown | default | no rule matched — conservative default |
| `JetboxSubscribeToSummaries` | unknown | default | no rule matched — conservative default |
| `JetboxWriteState` | **unsafe** | heuristic | Jetbox write — persists agent/file state |
| `JetboxWriteSummary` | **unsafe** | heuristic | Jetbox write — persists agent/file state |
| `ListCustomizationPathsByFile` | safe | heuristic | List* — pure read |
| `ListMcpPrompts` | safe | heuristic | List* — pure read |
| `ListMcpResources` | safe | heuristic | List* — pure read |
| `ListPages` | safe | heuristic | List* — pure read |
| `ListSidecarLogFiles` | safe | heuristic | List* — pure read |
| `LoadReplayConversation` | unknown | default | no rule matched — conservative default |
| `LoadTrajectory` | unknown | default | no rule matched — conservative default |
| `LoginWithBrowser` | unknown | default | no rule matched — conservative default |
| `ManageSidecar` | unknown | default | no rule matched — conservative default |
| `MigrateApiKey` | unknown | default | no rule matched — conservative default |
| `OpenUrl` | unknown | default | no rule matched — conservative default |
| `ProjectUpdatesStream` | unknown | default | no rule matched — conservative default |
| `ProvideCompletionFeedback` | unknown | default | no rule matched — conservative default |
| `ReadDir` | safe | heuristic | Read* — pure read |
| `ReadFile` | safe | heuristic | Read* — pure read |
| `ReadProject` | safe | heuristic | Read* — pure read |
| `ReconnectExtensionServer` | unknown | default | no rule matched — conservative default |
| `RecordAnalyticsEvent` | **unsafe** | override | explicit override |
| `RecordChatFeedback` | unknown | default | no rule matched — conservative default |
| `RecordChatPanelSession` | unknown | default | no rule matched — conservative default |
| `RecordCommitMessageSave` | unknown | default | no rule matched — conservative default |
| `RecordError` | unknown | default | no rule matched — conservative default |
| `RecordEvent` | unknown | default | no rule matched — conservative default |
| `RecordInteractiveCascadeFeedback` | unknown | default | no rule matched — conservative default |
| `RecordLints` | unknown | default | no rule matched — conservative default |
| `RecordObservabilityData` | unknown | default | no rule matched — conservative default |
| `RecordSearchDocOpen` | unknown | default | no rule matched — conservative default |
| `RecordSearchResultsView` | unknown | default | no rule matched — conservative default |
| `RecordSidecarEvent` | unknown | default | no rule matched — conservative default |
| `RecordUserGrep` | unknown | default | no rule matched — conservative default |
| `RecordUserStepSnapshot` | unknown | default | no rule matched — conservative default |
| `RefreshContextForIdeAction` | **unsafe** | heuristic | Refresh* — may trigger re-indexing side effects |
| `RefreshMcpServers` | **unsafe** | heuristic | Refresh* — may trigger re-indexing side effects |
| `RegisterGdmUser` | unknown | default | no rule matched — conservative default |
| `RegisterInteraction` | unknown | default | no rule matched — conservative default |
| `RejectDiff` | **unsafe** | heuristic | Reject* — discards a proposed diff/change |
| `RemoveTrackedWorkspace` | **unsafe** | heuristic | Remove* — removes state |
| `ReplayGroundTruthTrajectory` | unknown | default | no rule matched — conservative default |
| `RequestAgentStatePageUpdate` | unknown | override | explicit override |
| `ResetOnboarding` | unknown | default | no rule matched — conservative default |
| `ResolveFolder` | unknown | default | no rule matched — conservative default |
| `ResolveOutstandingSteps` | unknown | default | no rule matched — conservative default |
| `ResolveWorkspaceUrlPreview` | unknown | default | no rule matched — conservative default |
| `Restart` | **unsafe** | heuristic | Restart* — restarts a service |
| `RevertToCascadeStep` | unknown | default | no rule matched — conservative default |
| `RunCommand` | **unsafe** | heuristic | Run* — runs a command |
| `SaveAgentScriptCommandSpec` | **unsafe** | heuristic | Save* — persists content (e.g. SaveMediaAsArtifact) |
| `SaveMediaAsArtifact` | **unsafe** | heuristic | Save* — persists content (e.g. SaveMediaAsArtifact) |
| `SaveScreenRecording` | **unsafe** | heuristic | Save* — persists content (e.g. SaveMediaAsArtifact) |
| `ScanSkillsConfigFile` | unknown | default | no rule matched — conservative default |
| `SearchCode` | safe | heuristic | Search* — pure read (query only) |
| `SearchConversations` | safe | heuristic | Search* — pure read (query only) |
| `SearchFiles` | safe | heuristic | Search* — pure read (query only) |
| `SendActionToChatPanel` | **unsafe** | heuristic | Send* — emits a message / drives the agent |
| `SendAgentMessage` | **unsafe** | heuristic | Send* — emits a message / drives the agent |
| `SendAllQueuedMessages` | **unsafe** | heuristic | Send* — emits a message / drives the agent |
| `SendAudioChunk` | **unsafe** | heuristic | Send* — emits a message / drives the agent |
| `SendCascadeMessage` | **unsafe** | heuristic | Send* — emits a message / drives the agent |
| `SendStepsToBackground` | **unsafe** | heuristic | Send* — emits a message / drives the agent |
| `SendUserCascadeMessage` | **unsafe** | heuristic | Send* — emits a message / drives the agent |
| `SetBaseExperiments` | **unsafe** | heuristic | Set* — sets configuration/state |
| `SetBrowserOpenConversation` | **unsafe** | heuristic | Set* — sets configuration/state |
| `SetCloudCodeURL` | **unsafe** | heuristic | Set* — sets configuration/state |
| `SetOrVerifyStaticConfig` | **unsafe** | heuristic | Set* — sets configuration/state |
| `SetUserInfo` | **unsafe** | heuristic | Set* — sets configuration/state |
| `SetUserSettings` | **unsafe** | heuristic | Set* — sets configuration/state |
| `SetWorkingDirectories` | **unsafe** | heuristic | Set* — sets configuration/state |
| `SetupUniversitySandbox` | **unsafe** | heuristic | Set* — sets configuration/state |
| `ShouldEnableUnleash` | unknown | default | no rule matched — conservative default |
| `SignalExecutableIdle` | unknown | default | no rule matched — conservative default |
| `SimulateSegFault` | unknown | default | no rule matched — conservative default |
| `SkipBrowserSubagent` | unknown | default | no rule matched — conservative default |
| `SkipOnboarding` | unknown | default | no rule matched — conservative default |
| `SmartFocusConversation` | unknown | default | no rule matched — conservative default |
| `SmartOpenBrowser` | unknown | default | no rule matched — conservative default |
| `StartBattleMode` | **unsafe** | heuristic | Start* — starts an invocation/agent run |
| `StartCascade` | **unsafe** | heuristic | Start* — starts an invocation/agent run |
| `StartCascadeInvocation` | **unsafe** | heuristic | Start* — starts an invocation/agent run |
| `StartScreenRecording` | **unsafe** | heuristic | Start* — starts an invocation/agent run |
| `StatUri` | safe | override | explicit override |
| `StreamAgentStateUpdates` | safe | heuristic | Stream*Updates — read-only subscription |
| `StreamAudioTranscription` | unknown | heuristic | Stream* not matching *Updates — direction unclear |
| `StreamCascadePanelReactiveUpdates` | safe | heuristic | Stream*Updates — read-only subscription |
| `StreamCascadeReactiveUpdates` | safe | heuristic | Stream*Updates — read-only subscription |
| `StreamCascadeSummariesReactiveUpdates` | safe | heuristic | Stream*Updates — read-only subscription |
| `StreamTerminalShellCommand` | unknown | heuristic | Stream* not matching *Updates — direction unclear |
| `StreamUserTrajectoryReactiveUpdates` | safe | heuristic | Stream*Updates — read-only subscription |
| `SubscribeToSidecars` | unknown | default | no rule matched — conservative default |
| `ToggleMcpServer` | unknown | default | no rule matched — conservative default |
| `UninstallCascadePlugin` | **unsafe** | heuristic | Uninstall* — removes a plugin/extension |
| `UpdateCascadeMemory` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdateConversationAnnotations` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdateCustomization` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdateCustomizationPathsFile` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdateDevExperiments` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdateEnterpriseExperimentsFromUrl` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdatePRForWorktree` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdateProject` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `UpdateSettings` | **unsafe** | heuristic | Update* — mutates server/IDE state |
| `ValidateProject` | unknown | default | no rule matched — conservative default |
| `WaitForConversationFullyIdle` | unknown | default | no rule matched — conservative default |
| `WatchDirectory` | unknown | default | no rule matched — conservative default |
| `WellSupportedLanguages` | unknown | default | no rule matched — conservative default |
| `WriteFile` | **unsafe** | heuristic | Write* — persists state |
