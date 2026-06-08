# LS API Catalog — autoscan

Generated against a live LS (detector). Tiers run: 1, 2.

- Total methods: **237**
- Called this run: **49** (pass 22, removed 3, errors 16)
- Safe 93 / unsafe 63 / unknown 81

| Method | Safety | Kind | Called | Outcome | Resp shape | Note |
|---|---|---|---|---|---|---|
| AcceptTermsOfService | unsafe | unary |  |  |  | destructive — never auto-called |
| AcknowledgeCascadeCodeEdit | unknown | unary |  |  |  | unknown — not a read tier |
| AcknowledgeCodeActionStep | unknown | unary |  |  |  | unknown — not a read tier |
| AddEnvironmentToProject | unsafe | unary |  |  |  | unsafe — not a read tier |
| AddToBrowserWhitelist | unsafe | unary |  |  |  | destructive — never auto-called |
| AddTrackedWorkspace | unsafe | unary |  |  |  | destructive — never auto-called |
| AuthLogout | unknown | unary |  |  |  | destructive — never auto-called |
| BrowserValidateCascadeOrCancelOverlay | unknown | unary |  |  |  | unknown — not a read tier |
| CancelCascadeInvocation | unsafe | unary |  |  |  | unsafe — not a read tier |
| CancelCascadeSteps | unsafe | unary |  |  |  | unsafe — not a read tier |
| CaptureConsoleLogs | unknown | unary |  |  |  | unknown — not a read tier |
| CaptureScreenshot | unknown | unary |  |  |  | unknown — not a read tier |
| CheckDevToolsActivePort | safe | unary | ✓ | pass | {} |  |
| CheckoutWorktree | unsafe | unary |  |  |  | destructive — never auto-called |
| CompleteMcpOAuth | unknown | unary |  |  |  | unknown — not a read tier |
| ConvertTrajectoryToMarkdown | unknown | unary |  |  |  | unknown — not a read tier |
| CopyBuiltinWorkflowToWorkspace | unknown | unary |  |  |  | unknown — not a read tier |
| CreateCitcWorkspace | unsafe | unary |  |  |  | destructive — never auto-called |
| CreateCustomizationFile | unsafe | unary |  |  |  | destructive — never auto-called |
| CreateProject | unsafe | unary |  |  |  | destructive — never auto-called |
| CreateScratchProjectFolder | unsafe | unary |  |  |  | destructive — never auto-called |
| CreateTrajectoryShare | unsafe | unary |  |  |  | destructive — never auto-called |
| CreateWorktree | unsafe | unary |  |  |  | destructive — never auto-called |
| DeleteAgentMessage | unsafe | unary |  |  |  | unsafe — not a read tier |
| DeleteCascadeMemory | unsafe | unary |  |  |  | destructive — never auto-called |
| DeleteCascadeTrajectory | unsafe | unary |  |  |  | destructive — never auto-called |
| DeleteFileOrDirectory | unsafe | unary |  |  |  | destructive — never auto-called |
| DeleteMediaArtifact | unsafe | unary |  |  |  | destructive — never auto-called |
| DeletePlugin | unsafe | unary |  |  |  | destructive — never auto-called |
| DeleteProject | unsafe | unary |  |  |  | destructive — never auto-called |
| DeleteQueuedUserInputStep | unsafe | unary |  |  |  | destructive — never auto-called |
| DeleteWorktree | unsafe | unary |  |  |  | destructive — never auto-called |
| DisconnectMcpOAuth | unknown | unary |  |  |  | unknown — not a read tier |
| DownloadBuildWithGooglePlugin | unknown | unary |  |  |  | unknown — not a read tier |
| DumpFlightRecorder | unknown | unary |  |  |  | unknown — not a read tier |
| DumpPprof | unknown | unary |  |  |  | unknown — not a read tier |
| EndAudioSession | unknown | unary |  |  |  | unknown — not a read tier |
| EndBattleMode | unknown | unary |  |  |  | destructive — never auto-called |
| Exit | unknown | unary |  |  |  | destructive — never auto-called |
| FetchUserInfo | safe | unary | ✓ | pass | {userSettings:{telemetryEnabled:boolean} |  |
| FocusUserPage | unknown | unary |  |  |  | unknown — not a read tier |
| ForceBackgroundResearchRefresh | unknown | unary |  |  |  | unknown — not a read tier |
| ForceStopCascadeTree | unknown | unary |  |  |  | destructive — never auto-called |
| ForkConversation | unknown | unary |  |  |  | destructive — never auto-called |
| GenerateCommitMessage | unknown | unary |  |  |  | unknown — not a read tier |
| GenerateEnvironmentName | unknown | unary |  |  |  | unknown — not a read tier |
| GenerateSkillInstallationCL | unknown | unary |  |  |  | destructive — never auto-called |
| GetAgentScripts | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [workspaceUris] |
| GetAgentTeamMetadata | safe | unary |  |  |  | tier2: no live ids for [projectDirUri] |
| GetAllBrowserWhitelistedUrls | safe | unary | ✓ | http-500 | {code:string,message:string} |  |
| GetAllCascadeTrajectories | safe | unary |  |  |  | tier2: no live ids for [excludeSubtrajectories] |
| GetAllCustomAgentConfigs | safe | unary | ✓ | http-500 | {code:string,message:string} |  |
| GetAllPlugins | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [workspaceUris] |
| GetAllRules | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [workspaceUris] |
| GetAllSkills | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [workspaceUris] |
| GetAllWorkflows | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [workspaceUris] |
| GetArtifactSnapshots | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [cascadeId] |
| GetAuthStatus | safe | unary | ✓ | pass | {authResult:{grantedScopes:array<string> |  |
| GetAvailableCascadePlugins | safe | unary |  |  |  | tier2: no live ids for [metadata, os, searchQuery] |
| GetAvailableModels | safe | unary |  |  |  | tier2: no live ids for [forceRefresh] |
| GetBrowserOpenConversation | safe | unary | ✓ | http-500 | {code:string,message:string} |  |
| GetBrowserWhitelistFilePath | safe | unary | ✓ | http-500 | {code:string,message:string} |  |
| GetBuildWithGooglePlugins | safe | unary | ✓ | pass | {plugins:array<{gstatic:{link:string},pl |  |
| GetCascadeMemories | safe | unary | ✓ | http-500 | {code:string,message:string} |  |
| GetCascadeModelConfigData | safe | unary | ✓ | pass | {clientModelConfigs:array<{allowedTiers: |  |
| GetCascadeModelConfigs | safe | unary |  |  |  | tier2: no live ids for [metadata, filter] |
| GetCascadeNuxes | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetCascadePluginById | safe | unary |  |  |  | tier2: no live ids for [metadata, os, pluginId] |
| GetCascadeTrajectory | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [cascadeId] |
| GetCascadeTrajectoryExecutorMetadatas | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [cascadeId] |
| GetCascadeTrajectoryGeneratorMetadata | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [cascadeId] |
| GetCascadeTrajectorySteps | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [cascadeId] |
| GetChangelog | safe | unary |  |  |  | tier2: no live ids for [version] |
| GetCodeFrequencyForRepo | safe | unary |  |  |  | tier2: no live ids for [repoUri, branch, minutesPerBucket] |
| GetCodeValidationStates | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [cascadeId] |
| GetCommandModelConfigs | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetConversationMetadata | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [conversationId] |
| GetDebugDiagnostics | safe | unary | ✓ | pass | {languageServerDiagnostics:{logs:array<s |  |
| GetDefaultProjectDir | safe | unary | ✓ | pass | {defaultProjectDirUri:string} |  |
| GetGrantedScopes | safe | unary |  |  |  | tier2: no live ids for [isGcpTos] |
| GetKnowledgeItems | safe | unary | ✓ | pass | {} |  |
| GetLoadCodeAssist | safe | unary |  |  |  | tier2: no live ids for [forceRefresh] |
| GetLocalUserInfo | safe | unary | ✓ | pass | {homeDirUri:string,username:string} |  |
| GetMatchingContextScopeItems | safe | unary |  |  |  | tier2: no live ids for [metadata, query, fuzzyMatch, maxItem |
| GetMcpPrompt | safe | unary |  |  |  | tier2: no live ids for [serverName, name] |
| GetMcpServerStates | safe | unary | ✓ | pass | {} |  |
| GetMcpServerTemplates | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetMendelFlags | safe | unary | ✓ | pass | {experimentConfig:{experiments:array<{ke |  |
| GetModelResponse | safe | unary |  |  |  | tier2: no live ids for [prompt, model] |
| GetModelStatuses | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetPatchAndCodeChange | safe | unary |  |  |  | tier2: no live ids for [intent, baseStateRepoInfo, repoPath] |
| GetProfileData | safe | unary |  |  |  | tier2: no live ids for [apiKey] |
| GetRepoInfos | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetRevertPreview | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [cascadeId, stepIndex] |
| GetRevisionArtifact | safe | unary |  |  |  | tier2: no live ids for [repoPathUri, baseCommit] |
| GetSidecarEvents | safe | unary |  |  |  | tier2: no live ids for [sidecarId] |
| GetSidecarLogs | safe | server_streaming |  |  |  | streaming read (server_streaming) — use capture tool for sam |
| GetSidecars | safe | unary | ✓ | pass | {} |  |
| GetSkillMarketplaceLink | safe | unary |  |  |  | tier2: no live ids for [skillPath] |
| GetSlashCommands | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [cascadeId, workspaceUris] |
| GetStandaloneDir | safe | unary | ✓ | pass | {standaloneDir:string} |  |
| GetStaticExperimentStatus | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetStatus | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetTeamOrganizationalControls | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetTermsOfService | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetTokenBase | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [workspaceUris] |
| GetTranscription | safe | unary |  |  |  | tier2: no live ids for [metadata, audioData] |
| GetTurnDiff | safe | unary | ✓ | removed | {code:string,message:string} | filled [conversationId, stepIndex] |
| GetUnleashData | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetUserAnalyticsSummary | safe | unary |  |  |  | tier2: no live ids for [metadata, timeZone, startTimestamp,  |
| GetUserMemories | safe | unary | ✓ | http-500 | {code:string,message:string} |  |
| GetUserSettings | safe | unary | ✓ | removed | {code:string,message:string} |  |
| GetUserStatus | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetUserTrajectory | safe | unary | ✓ | removed | {code:string,message:string} | filled [trajectoryId] |
| GetUserTrajectoryDebug | safe | unary |  |  |  | tier2: no live ids for [includeAllTrajectories] |
| GetUserTrajectoryDescriptions | safe | unary | ✓ | pass | {} |  |
| GetWebDocsOptions | safe | unary |  |  |  | tier2: no live ids for [metadata] |
| GetWorkingDirectories | safe | unary | ✓ | pass | {} |  |
| GetWorkspaceEditState | safe | unary | ✓ | pass | {workspaceEdits:array<{}>} |  |
| GetWorkspaceInfos | safe | unary | ✓ | pass | {geminiDirUri:string,homeDirPath:string, |  |
| GetWorktreeDiff | safe | unary | ✓ | http-400 | {code:string,message:string} | filled [targetWorkspaceUri] |
| HandleCascadeUserInteraction | unsafe | unary |  |  |  | unsafe — not a read tier |
| HandleScreenRecording | unsafe | unary |  |  |  | destructive — never auto-called |
| HandleStreamingCommand | unsafe | server_streaming |  |  |  | unsafe — not a read tier |
| HasAuthToken | unknown | unary |  |  |  | unknown — not a read tier |
| Heartbeat | unknown | unary |  |  |  | unknown — not a read tier |
| ImportFromCursor | unknown | unary |  |  |  | destructive — never auto-called |
| ImportProjectFromUrl | unknown | unary |  |  |  | destructive — never auto-called |
| InitializeCascadePanelState | unknown | unary |  |  |  | unknown — not a read tier |
| InstallCascadePlugin | unsafe | unary |  |  |  | unsafe — not a read tier |
| JetboxDeleteSummary | unknown | unary |  |  |  | unknown — not a read tier |
| JetboxGetLatestVersion | unknown | unary |  |  |  | unknown — not a read tier |
| JetboxSubscribeToGcertState | unknown | server_streaming |  |  |  | unknown — not a read tier |
| JetboxSubscribeToOAuthState | unknown | server_streaming |  |  |  | unknown — not a read tier |
| JetboxSubscribeToState | unknown | server_streaming |  |  |  | unknown — not a read tier |
| JetboxSubscribeToSummaries | unknown | server_streaming |  |  |  | unknown — not a read tier |
| JetboxWriteState | unsafe | unary |  |  |  | unsafe — not a read tier |
| JetboxWriteSummary | unsafe | unary |  |  |  | unsafe — not a read tier |
| ListCustomizationPathsByFile | safe | unary |  |  |  | tier2: no live ids for [type, isGlobal] |
| ListMcpPrompts | safe | unary | ✓ | pass | {} |  |
| ListMcpResources | safe | unary |  |  |  | tier2: no live ids for [serverName, query] |
| ListPages | safe | unary | ✓ | pass | {} |  |
| ListSidecarLogFiles | safe | unary |  |  |  | tier2: no live ids for [sidecarId] |
| LoadReplayConversation | unknown | unary |  |  |  | unknown — not a read tier |
| LoadTrajectory | unknown | unary |  |  |  | unknown — not a read tier |
| LoginWithBrowser | unknown | unary |  |  |  | destructive — never auto-called |
| ManageSidecar | unknown | unary |  |  |  | unknown — not a read tier |
| MigrateApiKey | unknown | unary |  |  |  | destructive — never auto-called |
| OpenUrl | unknown | unary |  |  |  | destructive — never auto-called |
| ProjectUpdatesStream | unknown | server_streaming |  |  |  | unknown — not a read tier |
| ProvideCompletionFeedback | unknown | unary |  |  |  | unknown — not a read tier |
| ReadDir | safe | unary | ✓ | pass | {entries:array<{fileType:string,uri:stri | filled [uri] |
| ReadFile | safe | unary | ✓ | http-500 | {code:string,message:string} | filled [uri] |
| ReadProject | safe | unary |  |  |  | tier2: no live ids for [id] |
| ReconnectExtensionServer | unknown | unary |  |  |  | destructive — never auto-called |
| RecordAnalyticsEvent | unsafe | unary |  |  |  | unsafe — not a read tier |
| RecordChatFeedback | unknown | unary |  |  |  | unknown — not a read tier |
| RecordChatPanelSession | unknown | unary |  |  |  | unknown — not a read tier |
| RecordCommitMessageSave | unknown | unary |  |  |  | unknown — not a read tier |
| RecordError | unknown | unary |  |  |  | unknown — not a read tier |
| RecordEvent | unknown | unary |  |  |  | unknown — not a read tier |
| RecordInteractiveCascadeFeedback | unknown | unary |  |  |  | unknown — not a read tier |
| RecordLints | unknown | unary |  |  |  | unknown — not a read tier |
| RecordObservabilityData | unknown | unary |  |  |  | unknown — not a read tier |
| RecordSearchDocOpen | unknown | unary |  |  |  | unknown — not a read tier |
| RecordSearchResultsView | unknown | unary |  |  |  | unknown — not a read tier |
| RecordSidecarEvent | unknown | unary |  |  |  | unknown — not a read tier |
| RecordUserGrep | unknown | unary |  |  |  | unknown — not a read tier |
| RecordUserStepSnapshot | unknown | unary |  |  |  | unknown — not a read tier |
| RefreshContextForIdeAction | unsafe | unary |  |  |  | unsafe — not a read tier |
| RefreshMcpServers | unsafe | unary |  |  |  | unsafe — not a read tier |
| RegisterGdmUser | unknown | unary |  |  |  | unknown — not a read tier |
| RegisterInteraction | unknown | unary |  |  |  | unknown — not a read tier |
| RemoveTrackedWorkspace | unsafe | unary |  |  |  | destructive — never auto-called |
| ReplayGroundTruthTrajectory | unknown | unary |  |  |  | unknown — not a read tier |
| RequestAgentStatePageUpdate | unknown | unary |  |  |  | unknown — not a read tier |
| ResetOnboarding | unknown | unary |  |  |  | destructive — never auto-called |
| ResolveFolder | unknown | unary |  |  |  | unknown — not a read tier |
| ResolveOutstandingSteps | unknown | unary |  |  |  | unknown — not a read tier |
| ResolveWorkspaceUrlPreview | unknown | unary |  |  |  | unknown — not a read tier |
| Restart | unsafe | unary |  |  |  | destructive — never auto-called |
| RevertToCascadeStep | unknown | unary |  |  |  | destructive — never auto-called |
| RunCommand | unsafe | unary |  |  |  | unsafe — not a read tier |
| SaveAgentScriptCommandSpec | unsafe | unary |  |  |  | unsafe — not a read tier |
| SaveMediaAsArtifact | unsafe | unary |  |  |  | unsafe — not a read tier |
| SaveScreenRecording | unsafe | unary |  |  |  | destructive — never auto-called |
| ScanSkillsConfigFile | unknown | unary |  |  |  | unknown — not a read tier |
| SearchCode | safe | unary | ✓ | error:timeout |  | filled [workspaceUri] |
| SearchConversations | safe | unary |  |  |  | tier2: no live ids for [query, limit] |
| SearchFiles | safe | unary | ✓ | pass | {results:array<{absoluteUri:string,works | filled [workspaceUri] |
| SendActionToChatPanel | unsafe | unary |  |  |  | unsafe — not a read tier |
| SendAgentMessage | unsafe | unary |  |  |  | unsafe — not a read tier |
| SendAllQueuedMessages | unsafe | unary |  |  |  | unsafe — not a read tier |
| SendAudioChunk | unsafe | unary |  |  |  | unsafe — not a read tier |
| SendStepsToBackground | unsafe | unary |  |  |  | unsafe — not a read tier |
| SendUserCascadeMessage | unsafe | unary |  |  |  | unsafe — not a read tier |
| SetBaseExperiments | unsafe | unary |  |  |  | destructive — never auto-called |
| SetBrowserOpenConversation | unsafe | unary |  |  |  | unsafe — not a read tier |
| SetCloudCodeURL | unsafe | unary |  |  |  | destructive — never auto-called |
| SetOrVerifyStaticConfig | unsafe | unary |  |  |  | destructive — never auto-called |
| SetupUniversitySandbox | unsafe | unary |  |  |  | destructive — never auto-called |
| SetUserInfo | unsafe | unary |  |  |  | unsafe — not a read tier |
| SetUserSettings | unsafe | unary |  |  |  | unsafe — not a read tier |
| SetWorkingDirectories | unsafe | unary |  |  |  | unsafe — not a read tier |
| ShouldEnableUnleash | unknown | unary |  |  |  | unknown — not a read tier |
| SignalExecutableIdle | unknown | unary |  |  |  | unknown — not a read tier |
| SimulateSegFault | unknown | unary |  |  |  | destructive — never auto-called |
| SkipBrowserSubagent | unknown | unary |  |  |  | unknown — not a read tier |
| SkipOnboarding | unknown | unary |  |  |  | destructive — never auto-called |
| SmartFocusConversation | unknown | unary |  |  |  | unknown — not a read tier |
| SmartOpenBrowser | unknown | unary |  |  |  | destructive — never auto-called |
| StartBattleMode | unsafe | unary |  |  |  | destructive — never auto-called |
| StartCascade | unsafe | unary |  |  |  | unsafe — not a read tier |
| StartScreenRecording | unsafe | unary |  |  |  | destructive — never auto-called |
| StatUri | safe | unary | ✓ | pass | {fileType:string,modTime:string,normaliz | filled [uri] |
| StreamAgentStateUpdates | safe | server_streaming |  |  |  | streaming read (server_streaming) — use capture tool for sam |
| StreamAudioTranscription | unknown | server_streaming |  |  |  | unknown — not a read tier |
| StreamCascadePanelReactiveUpdates | safe | server_streaming |  |  |  | streaming read (server_streaming) — use capture tool for sam |
| StreamCascadeReactiveUpdates | safe | server_streaming |  |  |  | streaming read (server_streaming) — use capture tool for sam |
| StreamCascadeSummariesReactiveUpdates | safe | server_streaming |  |  |  | streaming read (server_streaming) — use capture tool for sam |
| StreamTerminalShellCommand | unknown | client_streaming |  |  |  | unknown — not a read tier |
| StreamUserTrajectoryReactiveUpdates | safe | server_streaming |  |  |  | streaming read (server_streaming) — use capture tool for sam |
| SubscribeToSidecars | unknown | server_streaming |  |  |  | unknown — not a read tier |
| ToggleMcpServer | unknown | unary |  |  |  | unknown — not a read tier |
| UpdateCascadeMemory | unsafe | unary |  |  |  | unsafe — not a read tier |
| UpdateConversationAnnotations | unsafe | unary |  |  |  | unsafe — not a read tier |
| UpdateCustomization | unsafe | unary |  |  |  | unsafe — not a read tier |
| UpdateCustomizationPathsFile | unsafe | unary |  |  |  | destructive — never auto-called |
| UpdateDevExperiments | unsafe | unary |  |  |  | destructive — never auto-called |
| UpdateEnterpriseExperimentsFromUrl | unsafe | unary |  |  |  | destructive — never auto-called |
| UpdatePRForWorktree | unsafe | unary |  |  |  | unsafe — not a read tier |
| UpdateProject | unsafe | unary |  |  |  | destructive — never auto-called |
| ValidateProject | unknown | unary |  |  |  | unknown — not a read tier |
| WaitForConversationFullyIdle | unknown | unary |  |  |  | unknown — not a read tier |
| WatchDirectory | unknown | server_streaming |  |  |  | unknown — not a read tier |
| WellSupportedLanguages | unknown | unary |  |  |  | unknown — not a read tier |
| WriteFile | unsafe | unary |  |  |  | destructive — never auto-called |