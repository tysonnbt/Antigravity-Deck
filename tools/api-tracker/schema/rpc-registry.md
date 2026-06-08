# Antigravity language_server RPC Registry

Extracted from webview bundle main.js (Antigravity v2.0.11).
Total services: 23. Total methods: 645.

Wire format: Connect-RPC over HTTP POST. Method URL = `/<package>.<Service>/<Method>`.

## exa.language_server_pb.LanguageServerService  (237 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ProvideCompletionFeedback | unary | exa.language_server_pb.ProvideCompletionFeedbackRequest | exa.language_server_pb.ProvideCompletionFeedbackResponse |
| Heartbeat | unary | exa.language_server_pb.HeartbeatRequest | exa.language_server_pb.HeartbeatResponse |
| GetStatus | unary | exa.language_server_pb.GetStatusRequest | exa.language_server_pb.GetStatusResponse |
| GetCommandModelConfigs | unary | exa.language_server_pb.GetCommandModelConfigsRequest | exa.language_server_pb.GetCommandModelConfigsResponse |
| GetCascadeModelConfigs | unary | exa.language_server_pb.GetCascadeModelConfigsRequest | exa.language_server_pb.GetCascadeModelConfigsResponse |
| GetStandaloneDir | unary | exa.language_server_pb.GetStandaloneDirRequest | exa.language_server_pb.GetStandaloneDirResponse |
| RecordEvent | unary | exa.language_server_pb.RecordEventRequest | exa.language_server_pb.RecordEventResponse |
| RecordSidecarEvent | unary | exa.language_server_pb.RecordSidecarEventRequest | exa.language_server_pb.RecordSidecarEventResponse |
| GetSidecars | unary | exa.language_server_pb.GetSidecarsRequest | exa.language_server_pb.GetSidecarsResponse |
| SubscribeToSidecars | server_streaming | exa.language_server_pb.SubscribeToSidecarsRequest | exa.language_server_pb.SubscribeToSidecarsResponse |
| GetSidecarEvents | unary | exa.language_server_pb.GetSidecarEventsRequest | exa.language_server_pb.GetSidecarEventsResponse |
| GetSidecarLogs | server_streaming | exa.language_server_pb.GetSidecarLogsRequest | exa.language_server_pb.GetSidecarLogsResponse |
| ListSidecarLogFiles | unary | exa.language_server_pb.ListSidecarLogFilesRequest | exa.language_server_pb.ListSidecarLogFilesResponse |
| ManageSidecar | unary | exa.language_server_pb.ManageSidecarRequest | exa.language_server_pb.ManageSidecarResponse |
| RegisterGdmUser | unary | exa.language_server_pb.RegisterGdmUserRequest | exa.language_server_pb.RegisterGdmUserResponse |
| MigrateApiKey | unary | exa.language_server_pb.MigrateApiKeyRequest | exa.language_server_pb.MigrateApiKeyResponse |
| WellSupportedLanguages | unary | exa.language_server_pb.WellSupportedLanguagesRequest | exa.language_server_pb.WellSupportedLanguagesResponse |
| RecordSearchDocOpen | unary | exa.language_server_pb.RecordSearchDocOpenRequest | exa.language_server_pb.RecordSearchDocOpenResponse |
| RecordSearchResultsView | unary | exa.language_server_pb.RecordSearchResultsViewRequest | exa.language_server_pb.RecordSearchResultsViewResponse |
| HandleStreamingCommand | server_streaming | exa.language_server_pb.HandleStreamingCommandRequest | exa.language_server_pb.HandleStreamingCommandResponse |
| GetMcpServerTemplates | unary | exa.language_server_pb.GetMcpServerTemplatesRequest | exa.language_server_pb.GetMcpServerTemplatesResponse |
| AddTrackedWorkspace | unary | exa.language_server_pb.AddTrackedWorkspaceRequest | exa.language_server_pb.AddTrackedWorkspaceResponse |
| RemoveTrackedWorkspace | unary | exa.language_server_pb.RemoveTrackedWorkspaceRequest | exa.language_server_pb.RemoveTrackedWorkspaceResponse |
| SmartFocusConversation | unary | exa.language_server_pb.SmartFocusConversationRequest | exa.language_server_pb.SmartFocusConversationResponse |
| StatUri | unary | exa.language_server_pb.StatUriRequest | exa.language_server_pb.StatUriResponse |
| ReadFile | unary | exa.language_server_pb.ReadFileRequest | exa.language_server_pb.ReadFileResponse |
| CheckDevToolsActivePort | unary | exa.language_server_pb.CheckDevToolsActivePortRequest | exa.language_server_pb.CheckDevToolsActivePortResponse |
| WriteFile | unary | exa.language_server_pb.WriteFileRequest | exa.language_server_pb.WriteFileResponse |
| ReadDir | unary | exa.language_server_pb.ReadDirRequest | exa.language_server_pb.ReadDirResponse |
| DeleteFileOrDirectory | unary | exa.language_server_pb.DeleteFileOrDirectoryRequest | exa.language_server_pb.DeleteFileOrDirectoryResponse |
| WatchDirectory | server_streaming | exa.language_server_pb.WatchDirectoryRequest | exa.language_server_pb.WatchDirectoryResponse |
| GetKnowledgeItems | unary | exa.language_server_pb.GetKnowledgeItemsRequest | exa.language_server_pb.GetKnowledgeItemsResponse |
| SetBrowserOpenConversation | unary | exa.language_server_pb.SetBrowserOpenConversationRequest | exa.language_server_pb.SetBrowserOpenConversationResponse |
| GetBrowserOpenConversation | unary | exa.language_server_pb.GetBrowserOpenConversationRequest | exa.language_server_pb.GetBrowserOpenConversationResponse |
| RefreshContextForIdeAction | unary | exa.language_server_pb.RefreshContextForIdeActionRequest | exa.language_server_pb.RefreshContextForIdeActionResponse |
| GetMatchingContextScopeItems | unary | exa.language_server_pb.GetMatchingContextScopeItemsRequest | exa.language_server_pb.GetMatchingContextScopeItemsResponse |
| RecordChatFeedback | unary | exa.language_server_pb.RecordChatFeedbackRequest | exa.language_server_pb.RecordChatFeedbackResponse |
| RecordChatPanelSession | unary | exa.language_server_pb.RecordChatPanelSessionRequest | exa.language_server_pb.RecordChatPanelSessionResponse |
| ShouldEnableUnleash | unary | exa.language_server_pb.ShouldEnableUnleashRequest | exa.language_server_pb.ShouldEnableUnleashResponse |
| GetWorkspaceEditState | unary | exa.language_server_pb.GetWorkspaceEditStateRequest | exa.language_server_pb.GetWorkspaceEditStateResponse |
| GetRepoInfos | unary | exa.language_server_pb.GetRepoInfosRequest | exa.language_server_pb.GetRepoInfosResponse |
| GetWorkspaceInfos | unary | exa.language_server_pb.GetWorkspaceInfosRequest | exa.language_server_pb.GetWorkspaceInfosResponse |
| GetLocalUserInfo | unary | exa.language_server_pb.GetLocalUserInfoRequest | exa.language_server_pb.GetLocalUserInfoResponse |
| ResolveWorkspaceUrlPreview | unary | exa.language_server_pb.ResolveWorkspaceUrlPreviewRequest | exa.language_server_pb.ResolveWorkspaceUrlPreviewResponse |
| CreateWorktree | unary | exa.language_server_pb.CreateWorktreeRequest | exa.language_server_pb.CreateWorktreeResponse |
| DeleteWorktree | unary | exa.language_server_pb.DeleteWorktreeRequest | exa.language_server_pb.DeleteWorktreeResponse |
| CheckoutWorktree | unary | exa.language_server_pb.CheckoutWorktreeRequest | exa.language_server_pb.CheckoutWorktreeResponse |
| GetWorktreeDiff | unary | exa.language_server_pb.GetWorktreeDiffRequest | exa.language_server_pb.GetWorktreeDiffResponse |
| CreateCitcWorkspace | unary | exa.language_server_pb.CreateCitcWorkspaceRequest | exa.language_server_pb.CreateCitcWorkspaceResponse |
| SetWorkingDirectories | unary | exa.language_server_pb.SetWorkingDirectoriesRequest | exa.language_server_pb.SetWorkingDirectoriesResponse |
| GetWorkingDirectories | unary | exa.language_server_pb.GetWorkingDirectoriesRequest | exa.language_server_pb.GetWorkingDirectoriesResponse |
| GetRevisionArtifact | unary | exa.language_server_pb.GetRevisionArtifactRequest | exa.language_server_pb.GetRevisionArtifactResponse |
| GenerateCommitMessage | unary | exa.language_server_pb.GenerateCommitMessageRequest | exa.language_server_pb.GenerateCommitMessageResponse |
| RecordCommitMessageSave | unary | exa.language_server_pb.RecordCommitMessageSaveRequest | exa.language_server_pb.RecordCommitMessageSaveResponse |
| UpdatePRForWorktree | unary | exa.language_server_pb.UpdatePRForWorktreeRequest | exa.language_server_pb.UpdatePRForWorktreeResponse |
| SendActionToChatPanel | unary | exa.language_server_pb.SendActionToChatPanelRequest | exa.language_server_pb.SendActionToChatPanelResponse |
| GetUserSettings | unary | exa.language_server_pb.GetUserSettingsRequest | exa.language_server_pb.GetUserSettingsResponse |
| SetUserSettings | unary | exa.language_server_pb.SetUserSettingsRequest | exa.language_server_pb.SetUserSettingsResponse |
| FetchUserInfo | unary | exa.language_server_pb.FetchUserInfoRequest | exa.language_server_pb.FetchUserInfoResponse |
| SetUserInfo | unary | exa.language_server_pb.SetUserInfoRequest | exa.language_server_pb.SetUserInfoResponse |
| GetDebugDiagnostics | unary | exa.language_server_pb.GetDebugDiagnosticsRequest | exa.language_server_pb.GetDebugDiagnosticsResponse |
| DumpFlightRecorder | unary | exa.language_server_pb.DumpFlightRecorderRequest | exa.language_server_pb.DumpFlightRecorderResponse |
| DumpPprof | unary | exa.language_server_pb.DumpPprofRequest | exa.language_server_pb.DumpPprofResponse |
| GetUserAnalyticsSummary | unary | exa.language_server_pb.GetUserAnalyticsSummaryRequest | exa.language_server_pb.GetUserAnalyticsSummaryResponse |
| GetUserStatus | unary | exa.language_server_pb.GetUserStatusRequest | exa.language_server_pb.GetUserStatusResponse |
| GetProfileData | unary | exa.language_server_pb.GetProfileDataRequest | exa.language_server_pb.GetProfileDataResponse |
| GetChangelog | unary | exa.language_server_pb.GetChangelogRequest | exa.language_server_pb.GetChangelogResponse |
| SetupUniversitySandbox | unary | exa.language_server_pb.SetupUniversitySandboxRequest | exa.language_server_pb.SetupUniversitySandboxResponse |
| Exit | unary | exa.language_server_pb.ExitRequest | exa.language_server_pb.ExitResponse |
| Restart | unary | exa.language_server_pb.RestartRequest | exa.language_server_pb.RestartResponse |
| ResetOnboarding | unary | exa.language_server_pb.ResetOnboardingRequest | exa.language_server_pb.ResetOnboardingResponse |
| SkipOnboarding | unary | exa.language_server_pb.SkipOnboardingRequest | exa.language_server_pb.SkipOnboardingResponse |
| GetTermsOfService | unary | exa.language_server_pb.GetTermsOfServiceRequest | exa.language_server_pb.GetTermsOfServiceResponse |
| AcceptTermsOfService | unary | exa.language_server_pb.AcceptTermsOfServiceRequest | exa.language_server_pb.AcceptTermsOfServiceResponse |
| GetUserTrajectoryDebug | unary | exa.language_server_pb.GetUserTrajectoryDebugRequest | exa.language_server_pb.GetUserTrajectoryDebugResponse |
| GetUserTrajectoryDescriptions | unary | exa.language_server_pb.GetUserTrajectoryDescriptionsRequest | exa.language_server_pb.GetUserTrajectoryDescriptionsResponse |
| StreamUserTrajectoryReactiveUpdates | server_streaming | exa.reactive_component_pb.StreamReactiveUpdatesRequest | exa.reactive_component_pb.StreamReactiveUpdatesResponse |
| GetCascadeMemories | unary | exa.language_server_pb.GetCascadeMemoriesRequest | exa.language_server_pb.GetCascadeMemoriesResponse |
| DeleteCascadeMemory | unary | exa.language_server_pb.DeleteCascadeMemoryRequest | exa.language_server_pb.DeleteCascadeMemoryResponse |
| UpdateCascadeMemory | unary | exa.language_server_pb.UpdateCascadeMemoryRequest | exa.language_server_pb.UpdateCascadeMemoryResponse |
| GetUserMemories | unary | exa.language_server_pb.GetUserMemoriesRequest | exa.language_server_pb.GetUserMemoriesResponse |
| UpdateConversationAnnotations | unary | exa.language_server_pb.UpdateConversationAnnotationsRequest | exa.language_server_pb.UpdateConversationAnnotationsResponse |
| StartCascade | unary | exa.language_server_pb.StartCascadeRequest | exa.language_server_pb.StartCascadeResponse |
| GetSlashCommands | unary | exa.language_server_pb.GetSlashCommandsRequest | exa.language_server_pb.GetSlashCommandsResponse |
| StartBattleMode | unary | exa.language_server_pb.StartBattleModeRequest | exa.language_server_pb.StartBattleModeResponse |
| EndBattleMode | unary | exa.language_server_pb.EndBattleModeRequest | exa.language_server_pb.EndBattleModeResponse |
| SetOrVerifyStaticConfig | unary | exa.language_server_pb.SetOrVerifyStaticConfigRequest | exa.language_server_pb.SetOrVerifyStaticConfigResponse |
| ForkConversation | unary | exa.language_server_pb.ForkConversationRequest | exa.language_server_pb.ForkConversationResponse |
| CancelCascadeInvocation | unary | exa.language_server_pb.CancelCascadeInvocationRequest | exa.language_server_pb.CancelCascadeInvocationResponse |
| ForceStopCascadeTree | unary | exa.language_server_pb.ForceStopCascadeTreeRequest | exa.language_server_pb.ForceStopCascadeTreeResponse |
| CancelCascadeSteps | unary | exa.language_server_pb.CancelCascadeStepsRequest | exa.language_server_pb.CancelCascadeStepsResponse |
| SendStepsToBackground | unary | exa.language_server_pb.SendStepsToBackgroundRequest | exa.language_server_pb.SendStepsToBackgroundResponse |
| SkipBrowserSubagent | unary | exa.language_server_pb.SkipBrowserSubagentRequest | exa.language_server_pb.SkipBrowserSubagentResponse |
| GetCascadeModelConfigData | unary | exa.language_server_pb.GetCascadeModelConfigDataRequest | exa.codeium_common_pb.CascadeModelConfigData |
| SendUserCascadeMessage | unary | exa.language_server_pb.SendUserCascadeMessageRequest | exa.language_server_pb.SendUserCascadeMessageResponse |
| SignalExecutableIdle | unary | exa.language_server_pb.SignalExecutableIdleRequest | exa.language_server_pb.SignalExecutableIdleResponse |
| WaitForConversationFullyIdle | unary | exa.language_server_pb.WaitForConversationFullyIdleRequest | exa.language_server_pb.WaitForConversationFullyIdleResponse |
| SendAllQueuedMessages | unary | exa.language_server_pb.SendAllQueuedMessagesRequest | exa.language_server_pb.SendAllQueuedMessagesResponse |
| DeleteQueuedUserInputStep | unary | exa.language_server_pb.DeleteQueuedUserInputStepRequest | exa.language_server_pb.DeleteQueuedUserInputStepResponse |
| RevertToCascadeStep | unary | exa.language_server_pb.RevertToCascadeStepRequest | exa.language_server_pb.RevertToCascadeStepResponse |
| GetRevertPreview | unary | exa.language_server_pb.GetRevertPreviewRequest | exa.language_server_pb.GetRevertPreviewResponse |
| RecordUserStepSnapshot | unary | exa.language_server_pb.RecordUserStepSnapshotRequest | exa.language_server_pb.RecordUserStepSnapshotResponse |
| GetAllCascadeTrajectories | unary | exa.language_server_pb.GetAllCascadeTrajectoriesRequest | exa.language_server_pb.GetAllCascadeTrajectoriesResponse |
| HandleCascadeUserInteraction | unary | exa.language_server_pb.HandleCascadeUserInteractionRequest | exa.language_server_pb.HandleCascadeUserInteractionResponse |
| AcknowledgeCascadeCodeEdit | unary | exa.language_server_pb.AcknowledgeCascadeCodeEditRequest | exa.language_server_pb.AcknowledgeCascadeCodeEditResponse |
| AcknowledgeCodeActionStep | unary | exa.language_server_pb.AcknowledgeCodeActionStepRequest | exa.language_server_pb.AcknowledgeCodeActionStepResponse |
| GetCodeValidationStates | unary | exa.language_server_pb.GetCodeValidationStatesRequest | exa.language_server_pb.GetCodeValidationStatesResponse |
| DeleteCascadeTrajectory | unary | exa.language_server_pb.DeleteCascadeTrajectoryRequest | exa.language_server_pb.DeleteCascadeTrajectoryResponse |
| GetConversationMetadata | unary | exa.language_server_pb.GetConversationMetadataRequest | exa.language_server_pb.GetConversationMetadataResponse |
| GetTurnDiff | unary | exa.language_server_pb.GetTurnDiffRequest | exa.language_server_pb.GetTurnDiffResponse |
| InitializeCascadePanelState | unary | exa.language_server_pb.InitializeCascadePanelStateRequest | exa.language_server_pb.InitializeCascadePanelStateResponse |
| StreamCascadePanelReactiveUpdates | server_streaming | exa.reactive_component_pb.StreamReactiveUpdatesRequest | exa.reactive_component_pb.StreamReactiveUpdatesResponse |
| StreamCascadeReactiveUpdates | server_streaming | exa.reactive_component_pb.StreamReactiveUpdatesRequest | exa.reactive_component_pb.StreamReactiveUpdatesResponse |
| StreamCascadeSummariesReactiveUpdates | server_streaming | exa.reactive_component_pb.StreamReactiveUpdatesRequest | exa.reactive_component_pb.StreamReactiveUpdatesResponse |
| StreamAgentStateUpdates | server_streaming | exa.jetski_cortex_pb.StreamAgentStateUpdatesRequest | exa.jetski_cortex_pb.StreamAgentStateUpdatesResponse |
| RequestAgentStatePageUpdate | unary | exa.jetski_cortex_pb.AgentStatePageUpdateRequest | exa.jetski_cortex_pb.AgentStatePageUpdateResponse |
| ForceBackgroundResearchRefresh | unary | exa.language_server_pb.ForceBackgroundResearchRefreshRequest | exa.language_server_pb.ForceBackgroundResearchRefreshResponse |
| ResolveOutstandingSteps | unary | exa.language_server_pb.ResolveOutstandingStepsRequest | exa.language_server_pb.ResolveOutstandingStepsResponse |
| RefreshMcpServers | unary | exa.language_server_pb.RefreshMcpServersRequest | exa.language_server_pb.RefreshMcpServersResponse |
| ToggleMcpServer | unary | exa.language_server_pb.ToggleMcpServerRequest | exa.language_server_pb.ToggleMcpServerResponse |
| GetMcpServerStates | unary | exa.language_server_pb.GetMcpServerStatesRequest | exa.language_server_pb.GetMcpServerStatesResponse |
| CompleteMcpOAuth | unary | exa.language_server_pb.CompleteMcpOAuthRequest | exa.language_server_pb.CompleteMcpOAuthResponse |
| DisconnectMcpOAuth | unary | exa.language_server_pb.DisconnectMcpOAuthRequest | exa.language_server_pb.DisconnectMcpOAuthResponse |
| StreamTerminalShellCommand | client_streaming | exa.codeium_common_pb.TerminalShellCommandStreamChunk | exa.language_server_pb.StreamTerminalShellCommandResponse |
| GetModelResponse | unary | exa.language_server_pb.GetModelResponseRequest | exa.language_server_pb.GetModelResponseResponse |
| SaveMediaAsArtifact | unary | exa.language_server_pb.SaveMediaAsArtifactRequest | exa.language_server_pb.SaveMediaAsArtifactResponse |
| DeleteMediaArtifact | unary | exa.language_server_pb.DeleteMediaArtifactRequest | exa.language_server_pb.DeleteMediaArtifactResponse |
| GetWebDocsOptions | unary | exa.language_server_pb.GetWebDocsOptionsRequest | exa.language_server_pb.GetWebDocsOptionsResponse |
| UpdateDevExperiments | unary | exa.language_server_pb.UpdateDevExperimentsRequest | exa.language_server_pb.UpdateDevExperimentsResponse |
| SetBaseExperiments | unary | exa.language_server_pb.SetBaseExperimentsRequest | exa.language_server_pb.SetBaseExperimentsResponse |
| GetUnleashData | unary | exa.language_server_pb.GetUnleashDataRequest | exa.language_server_pb.GetUnleashDataResponse |
| GetMendelFlags | unary | exa.language_server_pb.GetMendelFlagsRequest | exa.language_server_pb.GetMendelFlagsResponse |
| GetModelStatuses | unary | exa.language_server_pb.GetModelStatusesRequest | exa.language_server_pb.GetModelStatusesResponse |
| GetAllWorkflows | unary | exa.language_server_pb.GetAllWorkflowsRequest | exa.language_server_pb.GetAllWorkflowsResponse |
| GetAllCustomAgentConfigs | unary | exa.language_server_pb.GetAllCustomAgentConfigsRequest | exa.language_server_pb.GetAllCustomAgentConfigsResponse |
| CopyBuiltinWorkflowToWorkspace | unary | exa.language_server_pb.CopyBuiltinWorkflowToWorkspaceRequest | exa.language_server_pb.CopyBuiltinWorkflowToWorkspaceResponse |
| GetAllRules | unary | exa.language_server_pb.GetAllRulesRequest | exa.language_server_pb.GetAllRulesResponse |
| GetAllSkills | unary | exa.language_server_pb.GetAllSkillsRequest | exa.language_server_pb.GetAllSkillsResponse |
| GetSkillMarketplaceLink | unary | exa.language_server_pb.GetSkillMarketplaceLinkRequest | exa.language_server_pb.GetSkillMarketplaceLinkResponse |
| GenerateSkillInstallationCL | unary | exa.language_server_pb.GenerateSkillInstallationCLRequest | exa.language_server_pb.GenerateSkillInstallationCLResponse |
| ScanSkillsConfigFile | unary | exa.language_server_pb.ScanSkillsConfigFileRequest | exa.language_server_pb.ScanSkillsConfigFileResponse |
| ListMcpResources | unary | exa.language_server_pb.ListMcpResourcesRequest | exa.language_server_pb.ListMcpResourcesResponse |
| ListMcpPrompts | unary | exa.language_server_pb.ListMcpPromptsRequest | exa.language_server_pb.ListMcpPromptsResponse |
| GetMcpPrompt | unary | exa.language_server_pb.GetMcpPromptRequest | exa.language_server_pb.GetMcpPromptResponse |
| UpdateEnterpriseExperimentsFromUrl | unary | exa.language_server_pb.UpdateEnterpriseExperimentsFromUrlRequest | exa.language_server_pb.UpdateEnterpriseExperimentsFromUrlResponse |
| ImportFromCursor | unary | exa.language_server_pb.ImportFromCursorRequest | exa.language_server_pb.ImportFromCursorResponse |
| CreateCustomizationFile | unary | exa.language_server_pb.CreateCustomizationFileRequest | exa.language_server_pb.CreateCustomizationFileResponse |
| ListCustomizationPathsByFile | unary | exa.language_server_pb.ListCustomizationPathsByFileRequest | exa.language_server_pb.ListCustomizationPathsByFileResponse |
| UpdateCustomizationPathsFile | unary | exa.language_server_pb.UpdateCustomizationPathsFileRequest | exa.language_server_pb.UpdateCustomizationPathsFileResponse |
| GetTeamOrganizationalControls | unary | exa.language_server_pb.GetTeamOrganizationalControlsRequest | exa.language_server_pb.GetTeamOrganizationalControlsResponse |
| RecordUserGrep | unary | exa.language_server_pb.RecordUserGrepRequest | exa.language_server_pb.RecordUserGrepResponse |
| CreateTrajectoryShare | unary | exa.language_server_pb.CreateTrajectoryShareRequest | exa.language_server_pb.CreateTrajectoryShareResponse |
| GetCascadeTrajectory | unary | exa.language_server_pb.GetCascadeTrajectoryRequest | exa.language_server_pb.GetCascadeTrajectoryResponse |
| GetArtifactSnapshots | unary | exa.language_server_pb.GetArtifactSnapshotsRequest | exa.language_server_pb.GetArtifactSnapshotsResponse |
| GetUserTrajectory | unary | exa.language_server_pb.GetUserTrajectoryRequest | exa.language_server_pb.GetUserTrajectoryResponse |
| GetCascadeTrajectorySteps | unary | exa.language_server_pb.GetCascadeTrajectoryStepsRequest | exa.language_server_pb.GetCascadeTrajectoryStepsResponse |
| GetCascadeTrajectoryGeneratorMetadata | unary | exa.language_server_pb.GetCascadeTrajectoryGeneratorMetadataRequest | exa.language_server_pb.GetCascadeTrajectoryGeneratorMetadataResponse |
| GetCascadeTrajectoryExecutorMetadatas | unary | exa.language_server_pb.GetCascadeTrajectoryExecutorMetadatasRequest | exa.language_server_pb.GetCascadeTrajectoryExecutorMetadatasResponse |
| GetPatchAndCodeChange | unary | exa.language_server_pb.GetPatchAndCodeChangeRequest | exa.language_server_pb.GetPatchAndCodeChangeResponse |
| ConvertTrajectoryToMarkdown | unary | exa.language_server_pb.ConvertTrajectoryToMarkdownRequest | exa.language_server_pb.ConvertTrajectoryToMarkdownResponse |
| LoadTrajectory | unary | exa.language_server_pb.LoadTrajectoryRequest | exa.language_server_pb.LoadTrajectoryResponse |
| ImportProjectFromUrl | unary | exa.language_server_pb.ImportProjectFromUrlRequest | exa.language_server_pb.ImportProjectFromUrlResponse |
| GetAvailableCascadePlugins | unary | exa.language_server_pb.GetAvailableCascadePluginsRequest | exa.language_server_pb.GetAvailableCascadePluginsResponse |
| InstallCascadePlugin | unary | exa.language_server_pb.InstallCascadePluginRequest | exa.language_server_pb.InstallCascadePluginResponse |
| GetCascadePluginById | unary | exa.language_server_pb.GetCascadePluginByIdRequest | exa.language_server_pb.GetCascadePluginByIdResponse |
| GetAllPlugins | unary | exa.language_server_pb.GetAllPluginsRequest | exa.language_server_pb.GetAllPluginsResponse |
| GetBuildWithGooglePlugins | unary | exa.language_server_pb.GetBuildWithGooglePluginsRequest | exa.language_server_pb.GetBuildWithGooglePluginsResponse |
| DownloadBuildWithGooglePlugin | unary | exa.language_server_pb.DownloadBuildWithGooglePluginRequest | exa.language_server_pb.DownloadBuildWithGooglePluginResponse |
| DeletePlugin | unary | exa.language_server_pb.DeletePluginRequest | exa.language_server_pb.DeletePluginResponse |
| UpdateCustomization | unary | exa.language_server_pb.UpdateCustomizationRequest | exa.language_server_pb.UpdateCustomizationResponse |
| GetAgentScripts | unary | exa.language_server_pb.GetAgentScriptsRequest | exa.language_server_pb.GetAgentScriptsResponse |
| SaveAgentScriptCommandSpec | unary | exa.language_server_pb.SaveAgentScriptCommandSpecRequest | exa.language_server_pb.SaveAgentScriptCommandSpecResponse |
| RecordLints | unary | exa.language_server_pb.RecordLintsRequest | exa.language_server_pb.RecordLintsResponse |
| ReplayGroundTruthTrajectory | unary | exa.language_server_pb.ReplayGroundTruthTrajectoryRequest | exa.language_server_pb.ReplayGroundTruthTrajectoryResponse |
| LoadReplayConversation | unary | exa.language_server_pb.LoadReplayConversationRequest | exa.language_server_pb.LoadReplayConversationResponse |
| RecordInteractiveCascadeFeedback | unary | exa.language_server_pb.RecordInteractiveCascadeFeedbackRequest | exa.language_server_pb.RecordInteractiveCascadeFeedbackResponse |
| GetCascadeNuxes | unary | exa.language_server_pb.GetCascadeNuxesRequest | exa.language_server_pb.GetCascadeNuxesResponse |
| RegisterInteraction | unary | exa.language_server_pb.RegisterInteractionRequest | exa.language_server_pb.RegisterInteractionResponse |
| GetTranscription | unary | exa.language_server_pb.GetTranscriptionRequest | exa.language_server_pb.GetTranscriptionResponse |
| StreamAudioTranscription | server_streaming | exa.language_server_pb.StartAudioTranscriptionRequest | exa.language_server_pb.StreamAudioTranscriptionResponse |
| SendAudioChunk | unary | exa.language_server_pb.SendAudioChunkRequest | exa.language_server_pb.SendAudioChunkResponse |
| EndAudioSession | unary | exa.language_server_pb.EndAudioSessionRequest | exa.language_server_pb.EndAudioSessionResponse |
| GetStaticExperimentStatus | unary | exa.language_server_pb.GetStaticExperimentStatusRequest | exa.language_server_pb.GetStaticExperimentStatusResponse |
| RecordAnalyticsEvent | unary | exa.language_server_pb.RecordAnalyticsEventRequest | exa.language_server_pb.RecordAnalyticsEventResponse |
| RecordError | unary | exa.language_server_pb.RecordErrorRequest | exa.language_server_pb.RecordErrorResponse |
| RecordObservabilityData | unary | exa.language_server_pb.RecordObservabilityDataRequest | exa.language_server_pb.RecordObservabilityDataResponse |
| ListPages | unary | exa.language_server_pb.ListPagesRequest | exa.language_server_pb.ListPagesResponse |
| BrowserValidateCascadeOrCancelOverlay | unary | exa.language_server_pb.BrowserValidateCascadeOrCancelOverlayRequest | exa.language_server_pb.BrowserValidateCascadeOrCancelOverlayResponse |
| OpenUrl | unary | exa.language_server_pb.OpenUrlRequest | exa.language_server_pb.OpenUrlResponse |
| FocusUserPage | unary | exa.language_server_pb.FocusUserPageRequest | exa.language_server_pb.FocusUserPageResponse |
| AddToBrowserWhitelist | unary | exa.language_server_pb.AddToBrowserWhitelistRequest | exa.language_server_pb.AddToBrowserWhitelistResponse |
| CaptureConsoleLogs | unary | exa.language_server_pb.CaptureConsoleLogsRequest | exa.language_server_pb.CaptureConsoleLogsResponse |
| StartScreenRecording | unary | exa.language_server_pb.StartScreenRecordingRequest | exa.language_server_pb.StartScreenRecordingResponse |
| SaveScreenRecording | unary | exa.language_server_pb.SaveScreenRecordingRequest | exa.language_server_pb.SaveScreenRecordingResponse |
| GetBrowserWhitelistFilePath | unary | exa.language_server_pb.GetBrowserWhitelistFilePathRequest | exa.language_server_pb.GetBrowserWhitelistFilePathResponse |
| HandleScreenRecording | unary | exa.language_server_pb.HandleScreenRecordingRequest | exa.language_server_pb.HandleScreenRecordingResponse |
| GetAllBrowserWhitelistedUrls | unary | exa.language_server_pb.GetAllBrowserWhitelistedUrlsRequest | exa.language_server_pb.GetAllBrowserWhitelistedUrlsResponse |
| CaptureScreenshot | unary | exa.language_server_pb.CaptureScreenshotRequest | exa.language_server_pb.CaptureScreenshotResponse |
| SmartOpenBrowser | unary | exa.language_server_pb.SmartOpenBrowserRequest | exa.language_server_pb.SmartOpenBrowserResponse |
| SimulateSegFault | unary | exa.language_server_pb.SimulateSegFaultRequest | exa.language_server_pb.SimulateSegFaultResponse |
| ReconnectExtensionServer | unary | exa.language_server_pb.ReconnectExtensionServerRequest | exa.language_server_pb.ReconnectExtensionServerResponse |
| SetCloudCodeURL | unary | exa.language_server_pb.SetCloudCodeURLRequest | exa.language_server_pb.SetCloudCodeURLResponse |
| GetTokenBase | unary | exa.language_server_pb.GetTokenBaseRequest | exa.language_server_pb.GetTokenBaseResponse |
| RunCommand | unary | exa.language_server_pb.RunCommandRequest | exa.language_server_pb.RunCommandResponse |
| JetboxWriteState | unary | exa.language_server_pb.JetboxWriteStateRequest | exa.language_server_pb.JetboxWriteStateResponse |
| JetboxSubscribeToState | server_streaming | exa.language_server_pb.JetboxSubscribeToStateRequest | exa.language_server_pb.JetboxSubscribeToStateResponse |
| JetboxWriteSummary | unary | exa.language_server_pb.JetboxWriteSummaryRequest | exa.language_server_pb.JetboxWriteSummaryResponse |
| JetboxDeleteSummary | unary | exa.language_server_pb.JetboxDeleteSummaryRequest | exa.language_server_pb.JetboxDeleteSummaryResponse |
| JetboxSubscribeToSummaries | server_streaming | exa.language_server_pb.JetboxSubscribeToSummariesRequest | exa.language_server_pb.JetboxSubscribeToSummariesResponse |
| JetboxSubscribeToGcertState | server_streaming | exa.language_server_pb.JetboxSubscribeToGcertStateRequest | exa.language_server_pb.JetboxSubscribeToGcertStateResponse |
| JetboxSubscribeToOAuthState | server_streaming | exa.language_server_pb.JetboxSubscribeToOAuthStateRequest | exa.language_server_pb.JetboxSubscribeToOAuthStateResponse |
| SearchFiles | unary | exa.language_server_pb.SearchFilesRequest | exa.language_server_pb.SearchFilesResponse |
| SearchCode | unary | exa.language_server_pb.SearchCodeRequest | exa.language_server_pb.SearchCodeResponse |
| SearchConversations | unary | exa.language_server_pb.SearchConversationsRequest | exa.language_server_pb.SearchConversationsResponse |
| JetboxGetLatestVersion | unary | exa.language_server_pb.JetboxGetLatestVersionRequest | exa.language_server_pb.JetboxGetLatestVersionResponse |
| GetAgentTeamMetadata | unary | exa.language_server_pb.GetAgentTeamMetadataRequest | exa.language_server_pb.GetAgentTeamMetadataResponse |
| GetCodeFrequencyForRepo | unary | exa.language_server_pb.GetCodeFrequencyForRepoRequest | exa.language_server_pb.GetCodeFrequencyForRepoResponse |
| SendAgentMessage | unary | exa.language_server_pb.SendAgentMessageRequest | exa.language_server_pb.SendAgentMessageResponse |
| DeleteAgentMessage | unary | exa.language_server_pb.DeleteAgentMessageRequest | exa.language_server_pb.DeleteAgentMessageResponse |
| GetLoadCodeAssist | unary | exa.language_server_pb.GetLoadCodeAssistRequest | exa.language_server_pb.GetLoadCodeAssistResponse |
| GetAvailableModels | unary | exa.language_server_pb.GetAvailableModelsRequest | exa.language_server_pb.GetAvailableModelsResponse |
| CreateProject | unary | exa.language_server_pb.CreateProjectRequest | exa.language_server_pb.CreateProjectResponse |
| UpdateProject | unary | exa.language_server_pb.UpdateProjectRequest | exa.language_server_pb.UpdateProjectResponse |
| DeleteProject | unary | exa.language_server_pb.DeleteProjectRequest | exa.language_server_pb.DeleteProjectResponse |
| GenerateEnvironmentName | unary | exa.language_server_pb.GenerateEnvironmentNameRequest | exa.language_server_pb.GenerateEnvironmentNameResponse |
| AddEnvironmentToProject | unary | exa.language_server_pb.AddEnvironmentToProjectRequest | exa.language_server_pb.AddEnvironmentToProjectResponse |
| ResolveFolder | unary | exa.language_server_pb.ResolveFolderRequest | exa.language_server_pb.ResolveFolderResponse |
| ProjectUpdatesStream | server_streaming | exa.language_server_pb.ProjectUpdatesStreamRequest | exa.language_server_pb.ProjectUpdatesStreamResponse |
| ReadProject | unary | exa.language_server_pb.ReadProjectRequest | exa.language_server_pb.ReadProjectResponse |
| GetDefaultProjectDir | unary | exa.language_server_pb.GetDefaultProjectDirRequest | exa.language_server_pb.GetDefaultProjectDirResponse |
| GetAuthStatus | unary | exa.language_server_pb.GetAuthStatusRequest | exa.language_server_pb.GetAuthStatusResponse |
| LoginWithBrowser | unary | exa.language_server_pb.LoginWithBrowserRequest | exa.language_server_pb.LoginWithBrowserResponse |
| AuthLogout | unary | exa.language_server_pb.AuthLogoutRequest | exa.language_server_pb.AuthLogoutResponse |
| HasAuthToken | unary | exa.language_server_pb.HasAuthTokenRequest | exa.language_server_pb.HasAuthTokenResponse |
| ValidateProject | unary | exa.language_server_pb.ValidateProjectRequest | exa.language_server_pb.ValidateProjectResponse |
| GetGrantedScopes | unary | exa.language_server_pb.GetGrantedScopesRequest | exa.language_server_pb.GetGrantedScopesResponse |
| CreateScratchProjectFolder | unary | exa.language_server_pb.CreateScratchProjectFolderRequest | exa.language_server_pb.CreateScratchProjectFolderResponse |

## google.devtools.issuetracker.v1.IssueTracker  (134 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ListComponents | unary | google.devtools.issuetracker.v1.ListComponentsRequest | google.devtools.issuetracker.v1.ListComponentsResponse |
| BatchGetComponents | unary | google.devtools.issuetracker.v1.BatchGetComponentsRequest | google.devtools.issuetracker.v1.BatchGetComponentsResponse |
| GetComponent | unary | google.devtools.issuetracker.v1.GetComponentRequest | google.devtools.issuetracker.v1.Component |
| GetComponentMetadata | unary | google.devtools.issuetracker.v1.GetComponentMetadataRequest | google.devtools.issuetracker.v1.ComponentMetadata |
| GetComponentSloEditPolicy | unary | google.devtools.issuetracker.v1.GetComponentSloEditPolicyRequest | google.devtools.issuetracker.v1.ComponentSloEditPolicy |
| CreateComponent | unary | google.devtools.issuetracker.v1.CreateComponentRequest | google.devtools.issuetracker.v1.Component |
| UpdateComponent | unary | google.devtools.issuetracker.v1.UpdateComponentRequest | google.devtools.issuetracker.v1.Component |
| UpdateComponentSlo | unary | google.devtools.issuetracker.v1.UpdateComponentSloRequest | google.devtools.issuetracker.v1.Component |
| UpdateComponentTeam | unary | google.devtools.issuetracker.v1.UpdateComponentTeamRequest | google.devtools.issuetracker.v1.Component |
| MoveComponent | unary | google.devtools.issuetracker.v1.MoveComponentRequest | google.devtools.issuetracker.v1.Component |
| ModifyComponentPlaybook | unary | google.devtools.issuetracker.v1.ModifyComponentPlaybookRequest | google.devtools.issuetracker.v1.ModifyComponentPlaybookResponse |
| ListComponentPlaybooks | unary | google.devtools.issuetracker.v1.ListComponentPlaybooksRequest | google.devtools.issuetracker.v1.ListComponentPlaybooksResponse |
| ListComponentUpdates | unary | google.devtools.issuetracker.v1.ListComponentUpdatesRequest | google.devtools.issuetracker.v1.ListComponentUpdatesResponse |
| ListIssues | unary | google.devtools.issuetracker.v1.ListIssuesRequest | google.devtools.issuetracker.v1.ListIssuesResponse |
| ListIssueMetadata | unary | google.devtools.issuetracker.v1.ListIssueMetadataRequest | google.devtools.issuetracker.v1.ListIssueMetadataResponse |
| BatchGetIssues | unary | google.devtools.issuetracker.v1.BatchGetIssuesRequest | google.devtools.issuetracker.v1.BatchGetIssuesResponse |
| BatchGetIssueMetadata | unary | google.devtools.issuetracker.v1.BatchGetIssueMetadataRequest | google.devtools.issuetracker.v1.BatchGetIssueMetadataResponse |
| GetIssue | unary | google.devtools.issuetracker.v1.GetIssueRequest | google.devtools.issuetracker.v1.Issue |
| GetIssueMetadata | unary | google.devtools.issuetracker.v1.GetIssueMetadataRequest | google.devtools.issuetracker.v1.IssueMetadata |
| CreateIssue | unary | google.devtools.issuetracker.v1.CreateIssueRequest | google.devtools.issuetracker.v1.Issue |
| CreateIssueWithTemplate | unary | google.devtools.issuetracker.v1.CreateIssueWithTemplateRequest | google.devtools.issuetracker.v1.Issue |
| ModifyIssue | unary | google.devtools.issuetracker.v1.ModifyIssueRequest | google.devtools.issuetracker.v1.Issue |
| MoveIssue | unary | google.devtools.issuetracker.v1.MoveIssueRequest | google.devtools.issuetracker.v1.Issue |
| MarkIssueAsBlocking | unary | google.devtools.issuetracker.v1.MarkIssueAsBlockingRequest | google.devtools.issuetracker.v1.Issue |
| MarkIssueAsBlockedBy | unary | google.devtools.issuetracker.v1.MarkIssueAsBlockedByRequest | google.devtools.issuetracker.v1.Issue |
| UnmarkIssueAsBlocking | unary | google.devtools.issuetracker.v1.UnmarkIssueAsBlockingRequest | google.devtools.issuetracker.v1.Issue |
| UnmarkIssueAsBlockedBy | unary | google.devtools.issuetracker.v1.UnmarkIssueAsBlockedByRequest | google.devtools.issuetracker.v1.Issue |
| MarkIssueAsDuplicate | unary | google.devtools.issuetracker.v1.MarkIssueAsDuplicateRequest | google.devtools.issuetracker.v1.Issue |
| UnmarkIssueAsDuplicate | unary | google.devtools.issuetracker.v1.UnmarkIssueAsDuplicateRequest | google.devtools.issuetracker.v1.Issue |
| CreateIssueRelationship | unary | google.devtools.issuetracker.v1.CreateIssueRelationshipRequest | google.devtools.issuetracker.v1.IssueRelationship |
| BatchCreateIssueRelationships | unary | google.devtools.issuetracker.v1.BatchCreateIssueRelationshipsRequest | google.devtools.issuetracker.v1.BatchCreateIssueRelationshipsResponse |
| ListIssueRelationships | unary | google.devtools.issuetracker.v1.ListIssueRelationshipsRequest | google.devtools.issuetracker.v1.ListIssueRelationshipsResponse |
| UpdateIssueRelationship | unary | google.devtools.issuetracker.v1.UpdateIssueRelationshipRequest | google.devtools.issuetracker.v1.IssueRelationship |
| DeleteIssueRelationship | unary | google.devtools.issuetracker.v1.DeleteIssueRelationshipRequest | google.protobuf.Empty |
| BatchDeleteIssueRelationships | unary | google.devtools.issuetracker.v1.BatchDeleteIssueRelationshipsRequest | google.protobuf.Empty |
| BatchGetIssueRelationships | unary | google.devtools.issuetracker.v1.BatchGetIssueRelationshipsRequest | google.devtools.issuetracker.v1.BatchGetIssueRelationshipsResponse |
| GetIssueDescendants | unary | google.devtools.issuetracker.v1.GetIssueDescendantsRequest | google.devtools.issuetracker.v1.GetIssueDescendantsResponse |
| AggregateIssueDescendants | unary | google.devtools.issuetracker.v1.AggregateIssueDescendantsRequest | google.devtools.issuetracker.v1.AggregateIssueDescendantsResponse |
| UpdateIssueRetention | unary | google.devtools.issuetracker.v1.UpdateIssueRetentionRequest | google.devtools.issuetracker.v1.Issue |
| UnCcUser | unary | google.devtools.issuetracker.v1.UnCcUserRequest | google.protobuf.Empty |
| DeleteIssue | unary | google.devtools.issuetracker.v1.DeleteIssueRequest | google.devtools.issuetracker.v1.Issue |
| UndeleteIssue | unary | google.devtools.issuetracker.v1.UndeleteIssueRequest | google.devtools.issuetracker.v1.Issue |
| ListIssueUpdates | unary | google.devtools.issuetracker.v1.ListIssueUpdatesRequest | google.devtools.issuetracker.v1.ListIssueUpdatesResponse |
| GetStatusUpdate | unary | google.devtools.issuetracker.v1.GetStatusUpdateRequest | google.devtools.issuetracker.v1.StatusUpdate |
| ListStatusUpdates | unary | google.devtools.issuetracker.v1.ListStatusUpdatesRequest | google.devtools.issuetracker.v1.ListStatusUpdatesResponse |
| UpdateStatusUpdate | unary | google.devtools.issuetracker.v1.UpdateStatusUpdateRequest | google.devtools.issuetracker.v1.StatusUpdate |
| DeleteStatusUpdate | unary | google.devtools.issuetracker.v1.DeleteStatusUpdateRequest | google.protobuf.Empty |
| CreateIssueComment | unary | google.devtools.issuetracker.v1.CreateIssueCommentRequest | google.devtools.issuetracker.v1.IssueComment |
| ListIssueComments | unary | google.devtools.issuetracker.v1.ListIssueCommentsRequest | google.devtools.issuetracker.v1.ListIssueCommentsResponse |
| BatchGetIssueComments | unary | google.devtools.issuetracker.v1.BatchGetIssueCommentsRequest | google.devtools.issuetracker.v1.BatchGetIssueCommentsResponse |
| GetIssueComment | unary | google.devtools.issuetracker.v1.GetIssueCommentRequest | google.devtools.issuetracker.v1.IssueComment |
| UpdateIssueComment | unary | google.devtools.issuetracker.v1.UpdateIssueCommentRequest | google.devtools.issuetracker.v1.IssueComment |
| UpdateIssueCommentRetention | unary | google.devtools.issuetracker.v1.UpdateIssueCommentRetentionRequest | google.devtools.issuetracker.v1.IssueComment |
| DeleteIssueComment | unary | google.devtools.issuetracker.v1.DeleteIssueCommentRequest | google.protobuf.Empty |
| UndeleteIssueComment | unary | google.devtools.issuetracker.v1.UndeleteIssueCommentRequest | google.devtools.issuetracker.v1.IssueComment |
| ListIssueCommentHistory | unary | google.devtools.issuetracker.v1.ListIssueCommentHistoryRequest | google.devtools.issuetracker.v1.ListIssueCommentHistoryResponse |
| UpdateCommentReaction | unary | google.devtools.issuetracker.v1.UpdateCommentReactionRequest | google.devtools.issuetracker.v1.CommentReaction |
| ListCommentReactionResponders | unary | google.devtools.issuetracker.v1.ListCommentReactionRespondersRequest | google.devtools.issuetracker.v1.ListCommentReactionRespondersResponse |
| CreateAttachment | unary | google.devtools.issuetracker.v1.CreateAttachmentRequest | google.devtools.issuetracker.v1.Attachment |
| GetAttachment | unary | google.devtools.issuetracker.v1.GetAttachmentRequest | google.devtools.issuetracker.v1.Attachment |
| ListAttachments | unary | google.devtools.issuetracker.v1.ListAttachmentsRequest | google.devtools.issuetracker.v1.ListAttachmentsResponse |
| DeleteAttachment | unary | google.devtools.issuetracker.v1.DeleteAttachmentRequest | google.protobuf.Empty |
| UndeleteAttachment | unary | google.devtools.issuetracker.v1.UndeleteAttachmentRequest | google.devtools.issuetracker.v1.Attachment |
| UpdateAttachmentRetention | unary | google.devtools.issuetracker.v1.UpdateAttachmentRetentionRequest | google.devtools.issuetracker.v1.Attachment |
| UpdateIssueAccessLimit | unary | google.devtools.issuetracker.v1.UpdateIssueAccessLimitRequest | google.devtools.issuetracker.v1.IssueAccessLimit |
| ListCustomFields | unary | google.devtools.issuetracker.v1.ListCustomFieldsRequest | google.devtools.issuetracker.v1.ListCustomFieldsResponse |
| GetCustomField | unary | google.devtools.issuetracker.v1.GetCustomFieldRequest | google.devtools.issuetracker.v1.CustomField |
| CreateCustomField | unary | google.devtools.issuetracker.v1.CreateCustomFieldRequest | google.devtools.issuetracker.v1.CustomField |
| UpdateCustomField | unary | google.devtools.issuetracker.v1.UpdateCustomFieldRequest | google.devtools.issuetracker.v1.CustomField |
| DeleteCustomField | unary | google.devtools.issuetracker.v1.DeleteCustomFieldRequest | google.protobuf.Empty |
| ListFieldConfigs | unary | google.devtools.issuetracker.v1.ListFieldConfigsRequest | google.devtools.issuetracker.v1.ListFieldConfigsResponse |
| GetFieldConfig | unary | google.devtools.issuetracker.v1.GetFieldConfigRequest | google.devtools.issuetracker.v1.FieldConfig |
| UpdateFieldConfig | unary | google.devtools.issuetracker.v1.UpdateFieldConfigRequest | google.devtools.issuetracker.v1.FieldConfig |
| ReorderFieldConfigs | unary | google.devtools.issuetracker.v1.ReorderFieldConfigsRequest | google.devtools.issuetracker.v1.ReorderFieldConfigsResponse |
| UnorderFieldConfigs | unary | google.devtools.issuetracker.v1.UnorderFieldConfigsRequest | google.protobuf.Empty |
| UpdateFieldConfigsV2 | unary | google.devtools.issuetracker.v1.UpdateFieldConfigsV2Request | google.devtools.issuetracker.v1.UpdateFieldConfigsV2Response |
| ListTemplates | unary | google.devtools.issuetracker.v1.ListTemplatesRequest | google.devtools.issuetracker.v1.ListTemplatesResponse |
| GetTemplate | unary | google.devtools.issuetracker.v1.GetTemplateRequest | google.devtools.issuetracker.v1.Template |
| CreateTemplate | unary | google.devtools.issuetracker.v1.CreateTemplateRequest | google.devtools.issuetracker.v1.Template |
| UpdateTemplate | unary | google.devtools.issuetracker.v1.UpdateTemplateRequest | google.devtools.issuetracker.v1.Template |
| AddHotlistsToTemplate | unary | google.devtools.issuetracker.v1.AddHotlistsToTemplateRequest | google.devtools.issuetracker.v1.Template |
| RemoveHotlistsFromTemplate | unary | google.devtools.issuetracker.v1.RemoveHotlistsFromTemplateRequest | google.devtools.issuetracker.v1.Template |
| DeleteTemplate | unary | google.devtools.issuetracker.v1.DeleteTemplateRequest | google.protobuf.Empty |
| ListHotlists | unary | google.devtools.issuetracker.v1.ListHotlistsRequest | google.devtools.issuetracker.v1.ListHotlistsResponse |
| GetHotlist | unary | google.devtools.issuetracker.v1.GetHotlistRequest | google.devtools.issuetracker.v1.Hotlist |
| BatchGetHotlists | unary | google.devtools.issuetracker.v1.BatchGetHotlistsRequest | google.devtools.issuetracker.v1.BatchGetHotlistsResponse |
| CreateHotlist | unary | google.devtools.issuetracker.v1.CreateHotlistRequest | google.devtools.issuetracker.v1.Hotlist |
| UpdateHotlist | unary | google.devtools.issuetracker.v1.UpdateHotlistRequest | google.devtools.issuetracker.v1.Hotlist |
| ListHotlistEntries | unary | google.devtools.issuetracker.v1.ListHotlistEntriesRequest | google.devtools.issuetracker.v1.ListHotlistEntriesResponse |
| CreateHotlistEntry | unary | google.devtools.issuetracker.v1.CreateHotlistEntryRequest | google.devtools.issuetracker.v1.HotlistEntry |
| BatchCreateHotlistEntries | unary | google.devtools.issuetracker.v1.BatchCreateHotlistEntriesRequest | google.devtools.issuetracker.v1.BatchCreateHotlistEntriesResponse |
| DeleteHotlistEntry | unary | google.devtools.issuetracker.v1.DeleteHotlistEntryRequest | google.protobuf.Empty |
| BatchDeleteHotlistEntries | unary | google.devtools.issuetracker.v1.BatchDeleteHotlistEntriesRequest | google.protobuf.Empty |
| UpdateHotlistEntry | unary | google.devtools.issuetracker.v1.UpdateHotlistEntryRequest | google.devtools.issuetracker.v1.HotlistEntry |
| BatchUpdateHotlistEntries | unary | google.devtools.issuetracker.v1.BatchUpdateHotlistEntriesRequest | google.devtools.issuetracker.v1.BatchUpdateHotlistEntriesResponse |
| GetSavedSearch | unary | google.devtools.issuetracker.v1.GetSavedSearchRequest | google.devtools.issuetracker.v1.SavedSearch |
| BatchGetSavedSearches | unary | google.devtools.issuetracker.v1.BatchGetSavedSearchesRequest | google.devtools.issuetracker.v1.BatchGetSavedSearchesResponse |
| CreateSavedSearch | unary | google.devtools.issuetracker.v1.CreateSavedSearchRequest | google.devtools.issuetracker.v1.SavedSearch |
| UpdateSavedSearch | unary | google.devtools.issuetracker.v1.UpdateSavedSearchRequest | google.devtools.issuetracker.v1.SavedSearch |
| DeleteSavedSearch | unary | google.devtools.issuetracker.v1.DeleteSavedSearchRequest | google.protobuf.Empty |
| ListSlos | unary | google.devtools.issuetracker.v1.ListSlosRequest | google.devtools.issuetracker.v1.ListSlosResponse |
| GetSlo | unary | google.devtools.issuetracker.v1.GetSloRequest | google.devtools.issuetracker.v1.Slo |
| ListSloUpdates | unary | google.devtools.issuetracker.v1.ListSloUpdatesRequest | google.devtools.issuetracker.v1.ListSloUpdatesResponse |
| CreateSlo | unary | google.devtools.issuetracker.v1.CreateSloRequest | google.devtools.issuetracker.v1.Slo |
| UpdateSlo | unary | google.devtools.issuetracker.v1.UpdateSloRequest | google.devtools.issuetracker.v1.Slo |
| BatchGetTeams | unary | google.devtools.issuetracker.v1.BatchGetTeamsRequest | google.devtools.issuetracker.v1.BatchGetTeamsResponse |
| GetTeam | unary | google.devtools.issuetracker.v1.GetTeamRequest | google.devtools.issuetracker.v1.Team |
| UpdateTeam | unary | google.devtools.issuetracker.v1.UpdateTeamRequest | google.devtools.issuetracker.v1.Team |
| UpdateTeamSlo | unary | google.devtools.issuetracker.v1.UpdateTeamSloRequest | google.devtools.issuetracker.v1.Team |
| GetTeamSloEditPolicy | unary | google.devtools.issuetracker.v1.GetTeamSloEditPolicyRequest | google.devtools.issuetracker.v1.TeamSloEditPolicy |
| UpdateTeamSloEditPolicy | unary | google.devtools.issuetracker.v1.UpdateTeamSloEditPolicyRequest | google.devtools.issuetracker.v1.TeamSloEditPolicy |
| ListBookmarkGroups | unary | google.devtools.issuetracker.v1.ListBookmarkGroupsRequest | google.devtools.issuetracker.v1.ListBookmarkGroupsResponse |
| GetBookmarkGroup | unary | google.devtools.issuetracker.v1.GetBookmarkGroupRequest | google.devtools.issuetracker.v1.BookmarkGroup |
| CreateBookmarkGroup | unary | google.devtools.issuetracker.v1.CreateBookmarkGroupRequest | google.devtools.issuetracker.v1.BookmarkGroup |
| UpdateBookmarkGroup | unary | google.devtools.issuetracker.v1.UpdateBookmarkGroupRequest | google.devtools.issuetracker.v1.BookmarkGroup |
| GetAccessPolicy | unary | google.devtools.issuetracker.v1.GetAccessPolicyRequest | google.devtools.issuetracker.v1.AccessPolicy |
| UpdateAccessPolicy | unary | google.devtools.issuetracker.v1.UpdateAccessPolicyRequest | google.devtools.issuetracker.v1.AccessPolicy |
| GetAccessLimit | unary | google.devtools.issuetracker.v1.GetAccessLimitRequest | google.devtools.issuetracker.v1.AccessLimit |
| UpdateAccessLimit | unary | google.devtools.issuetracker.v1.UpdateAccessLimitRequest | google.devtools.issuetracker.v1.AccessLimit |
| GetUserAccess | unary | google.devtools.issuetracker.v1.GetUserAccessRequest | google.devtools.issuetracker.v1.GetUserAccessResponse |
| GetAutomationAccess | unary | google.devtools.issuetracker.v1.GetAutomationAccessRequest | google.devtools.issuetracker.v1.GetAutomationAccessResponse |
| GetGroupMembership | unary | google.devtools.issuetracker.v1.GetGroupMembershipRequest | google.devtools.issuetracker.v1.GetGroupMembershipResponse |
| GetUserBookmarks | unary | google.devtools.issuetracker.v1.GetUserBookmarksRequest | google.devtools.issuetracker.v1.BookmarkGroup |
| AddUserBookmark | unary | google.devtools.issuetracker.v1.BookmarkItem | google.devtools.issuetracker.v1.BookmarkItem |
| RemoveUserBookmark | unary | google.devtools.issuetracker.v1.BookmarkItem | google.protobuf.Empty |
| ListUserComponents | unary | google.devtools.issuetracker.v1.ListUserComponentsRequest | google.devtools.issuetracker.v1.ListUserComponentsResponse |
| UpdateUserIssueVote | unary | google.devtools.issuetracker.v1.UpdateUserIssueVoteRequest | google.protobuf.Empty |
| UpdateUserIssueStar | unary | google.devtools.issuetracker.v1.UpdateUserIssueStarRequest | google.protobuf.Empty |
| UpdateUserIssueSubscription | unary | google.devtools.issuetracker.v1.UpdateUserIssueSubscriptionRequest | google.protobuf.Empty |
| FormatComment | unary | google.devtools.issuetracker.v1.FormatCommentRequest | google.devtools.issuetracker.v1.FormatCommentResponse |
| CreateContentJudgement | unary | google.devtools.issuetracker.v1.CreateContentJudgementRequest | google.devtools.issuetracker.v1.ContentJudgement |
| DeleteContentJudgement | unary | google.devtools.issuetracker.v1.DeleteContentJudgementRequest | google.protobuf.Empty |
| UpdateContentJudgement | unary | google.devtools.issuetracker.v1.UpdateContentJudgementRequest | google.devtools.issuetracker.v1.ContentJudgement |
| ListContentJudgements | unary | google.devtools.issuetracker.v1.ListContentJudgementsRequest | google.devtools.issuetracker.v1.ListContentJudgementsResponse |

## exa.api_server_pb.ApiServerService  (114 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| GetStreamingExternalChatCompletions | server_streaming | exa.api_server_pb.GetStreamingExternalChatCompletionsRequest | exa.api_server_pb.GetStreamingExternalChatCompletionsResponse |
| GetEmbeddings | unary | exa.api_server_pb.GetEmbeddingsRequest | exa.api_server_pb.GetEmbeddingsResponse |
| GetChatMessage | server_streaming | exa.api_server_pb.GetChatMessageRequest | exa.api_server_pb.GetChatMessageResponse |
| GetStreamingModelAPITextCompletion | server_streaming | exa.api_server_pb.GetStreamingModelAPITextCompletionRequest | exa.api_server_pb.GetStreamingModelAPITextCompletionResponse |
| GetTeamOrganizationalControls | unary | exa.api_server_pb.GetTeamOrganizationalControlsRequest | exa.api_server_pb.GetTeamOrganizationalControlsResponse |
| GetTeamOrganizationalControlsForSite | unary | exa.api_server_pb.GetTeamOrganizationalControlsForSiteRequest | exa.api_server_pb.GetTeamOrganizationalControlsForSiteResponse |
| UpsertTeamOrganizationalControls | unary | exa.api_server_pb.UpsertTeamOrganizationalControlsRequest | exa.api_server_pb.UpsertTeamOrganizationalControlsResponse |
| UpsertTeamOrganizationalControlsForSite | unary | exa.api_server_pb.UpsertTeamOrganizationalControlsForSiteRequest | exa.api_server_pb.UpsertTeamOrganizationalControlsForSiteResponse |
| DeleteTeamOrganizationalControls | unary | exa.api_server_pb.DeleteTeamOrganizationalControlsRequest | exa.api_server_pb.DeleteTeamOrganizationalControlsResponse |
| GetMQuery | unary | exa.api_server_pb.GetMQueryRequest | exa.api_server_pb.GetMQueryResponse |
| ProvideFeedback | unary | exa.api_server_pb.ProvideFeedbackRequest | exa.api_server_pb.ProvideFeedbackResponse |
| UploadErrorTraces | unary | exa.api_server_pb.UploadErrorTracesRequest | exa.api_server_pb.UploadErrorTracesResponse |
| RecordOpportunities | unary | exa.api_server_pb.RecordOpportunitiesRequest | exa.api_server_pb.RecordOpportunitiesResponse |
| RecordCodeTrackerUpdates | unary | exa.api_server_pb.RecordCodeTrackerUpdatesRequest | exa.api_server_pb.RecordCodeTrackerUpdatesResponse |
| RecordCompletionExample | unary | exa.api_server_pb.RecordCompletionExampleRequest | exa.api_server_pb.RecordCompletionExampleResponse |
| GetCompletionExamples | unary | exa.api_server_pb.GetCompletionExamplesRequest | exa.api_server_pb.GetCompletionExamplesResponse |
| RecordCompletions | unary | exa.analytics_pb.RecordCompletionsRequest | exa.analytics_pb.RecordCompletionsResponse |
| RecordAsyncTelemetry | unary | exa.api_server_pb.RecordAsyncTelemetryRequest | exa.api_server_pb.RecordAsyncTelemetryResponse |
| RecordChat | unary | exa.api_server_pb.RecordChatRequest | exa.api_server_pb.RecordChatResponse |
| RecordChatFeedback | unary | exa.api_server_pb.RecordChatFeedbackRequest | exa.api_server_pb.RecordChatFeedbackResponse |
| RecordChatPanelSession | unary | exa.api_server_pb.RecordChatPanelSessionRequest | exa.api_server_pb.RecordChatPanelSessionResponse |
| RecordContextRefresh | unary | exa.api_server_pb.RecordContextRefreshRequest | exa.api_server_pb.RecordContextRefreshResponse |
| RecordContextToPrompt | unary | exa.analytics_pb.RecordContextToPromptRequest | exa.analytics_pb.RecordContextToPromptResponse |
| RecordEvent | unary | exa.api_server_pb.RecordEventRequest | exa.api_server_pb.RecordEventResponse |
| RecordSearch | unary | exa.api_server_pb.RecordSearchRequest | exa.api_server_pb.RecordSearchResponse |
| RecordSearchResults | unary | exa.api_server_pb.RecordSearchResultsRequest | exa.api_server_pb.RecordSearchResultsResponse |
| RecordSearchDocOpen | unary | exa.api_server_pb.RecordSearchDocOpenRequest | exa.api_server_pb.RecordSearchDocOpenResponse |
| RecordSearchResultsView | unary | exa.api_server_pb.RecordSearchResultsViewRequest | exa.api_server_pb.RecordSearchResultsViewResponse |
| RecordDebounce | unary | exa.api_server_pb.RecordDebounceRequest | exa.api_server_pb.RecordDebounceResponse |
| RecordPinnedContext | unary | exa.api_server_pb.RecordPinnedContextRequest | exa.api_server_pb.RecordPinnedContextResponse |
| RecordCommandUsage | unary | exa.analytics_pb.RecordCommandUsageRequest | exa.analytics_pb.RecordCommandUsageResponse |
| RecordChatModelNodeRun | unary | exa.api_server_pb.RecordChatModelNodeRunRequest | exa.api_server_pb.RecordChatModelNodeRunResponse |
| RecordMQuery | unary | exa.api_server_pb.RecordMQueryRequest | exa.api_server_pb.RecordMQueryResponse |
| RecordCortexStep | unary | exa.api_server_pb.RecordCortexStepRequest | exa.api_server_pb.RecordCortexStepResponse |
| RecordCommitMessageGeneration | unary | exa.api_server_pb.RecordCommitMessageGenerationRequest | exa.api_server_pb.RecordCommitMessageGenerationResponse |
| RecordCommitMessageSave | unary | exa.api_server_pb.RecordCommitMessageSaveRequest | exa.api_server_pb.RecordCommitMessageSaveResponse |
| RecordGitTelemetry | unary | exa.api_server_pb.RecordGitTelemetryRequest | exa.api_server_pb.RecordGitTelemetryResponse |
| RecordProfilingData | client_streaming | exa.api_server_pb.RecordProfilingDataRequest | exa.api_server_pb.RecordProfilingDataResponse |
| RecordReadUrlContent | unary | exa.api_server_pb.RecordReadUrlContentRequest | exa.api_server_pb.RecordReadUrlContentResponse |
| RecordNewCortexPlan | unary | exa.api_server_pb.RecordNewCortexPlanRequest | exa.api_server_pb.RecordNewCortexPlanResponse |
| RecordCortexCodingPlan | unary | exa.api_server_pb.RecordCortexCodingPlanRequest | exa.api_server_pb.RecordCortexCodingPlanResponse |
| RecordCortexCodingStep | unary | exa.api_server_pb.RecordCortexCodingStepRequest | exa.api_server_pb.RecordCortexCodingStepResponse |
| RecordCortexCodingStepFeedback | unary | exa.api_server_pb.RecordCortexCodingStepFeedbackRequest | exa.api_server_pb.RecordCortexCodingStepFeedbackResponse |
| RecordCortexFeedback | unary | exa.api_server_pb.RecordCortexFeedbackRequest | exa.api_server_pb.RecordCortexFeedbackResponse |
| RecordCortexError | unary | exa.api_server_pb.RecordCortexErrorRequest | exa.api_server_pb.RecordCortexErrorResponse |
| RecordCortexTrajectory | unary | exa.analytics_pb.RecordCortexTrajectoryRequest | exa.analytics_pb.RecordCortexTrajectoryResponse |
| RecordCortexTrajectoryStep | unary | exa.analytics_pb.RecordCortexTrajectoryStepRequest | exa.analytics_pb.RecordCortexTrajectoryStepResponse |
| RecordCortexGeneratorMetadata | unary | exa.api_server_pb.RecordCortexGeneratorMetadataRequest | exa.api_server_pb.RecordCortexGeneratorMetadataResponse |
| RecordCortexExecutionMetadata | unary | exa.api_server_pb.RecordCortexExecutionMetadataRequest | exa.api_server_pb.RecordCortexExecutionMetadataResponse |
| RecordStateInitializationData | unary | exa.api_server_pb.RecordStateInitializationDataRequest | exa.api_server_pb.RecordStateInitializationDataResponse |
| GetDefaultWorkflowTemplates | unary | exa.api_server_pb.GetDefaultWorkflowTemplatesRequest | exa.api_server_pb.GetDefaultWorkflowTemplatesResponse |
| BatchRecordPrompts | unary | exa.analytics_pb.BatchRecordPromptsRequest | exa.analytics_pb.BatchRecordPromptsResponse |
| BatchRecordCompletions | unary | exa.analytics_pb.BatchRecordCompletionsRequest | exa.analytics_pb.BatchRecordCompletionsResponse |
| BatchRecordUserLastUpdateTimes | unary | exa.api_server_pb.BatchRecordUserLastUpdateTimesRequest | exa.api_server_pb.BatchRecordUserLastUpdateTimesResponse |
| BatchRecordChatRequestRecords | unary | exa.api_server_pb.BatchRecordChatRequestRecordsRequest | exa.api_server_pb.BatchRecordChatRequestRecordsResponse |
| Ping | unary | exa.api_server_pb.PingRequest | exa.api_server_pb.PingResponse |
| WhoAmI | unary | exa.api_server_pb.WhoAmIRequest | exa.api_server_pb.WhoAmIResponse |
| Subscribe | unary | exa.api_server_pb.SubscribeRequest | exa.api_server_pb.SubscribeResponse |
| ValidateEmail | unary | exa.api_server_pb.ValidateEmailRequest | exa.api_server_pb.ValidateEmailResponse |
| ValidateRegistrationCode | unary | exa.api_server_pb.ValidateRegistrationCodeRequest | exa.api_server_pb.ValidateRegistrationCodeResponse |
| JoinWaitlist | unary | exa.api_server_pb.JoinWaitlistRequest | exa.api_server_pb.JoinWaitlistResponse |
| ContactForm | unary | exa.api_server_pb.ContactFormRequest | exa.api_server_pb.ContactFormResponse |
| GetExtensionStats | unary | exa.api_server_pb.GetExtensionStatsRequest | exa.api_server_pb.GetExtensionStatsResponse |
| SubscribeToBlog | unary | exa.api_server_pb.SubscribeToBlogRequest | exa.api_server_pb.SubscribeToBlogResponse |
| UnsubscribeFromEmails | unary | exa.api_server_pb.UnsubscribeFromEmailsRequest | exa.api_server_pb.UnsubscribeFromEmailsResponse |
| SendReferralEmail | unary | exa.api_server_pb.SendReferralEmailRequest | exa.api_server_pb.SendReferralEmailResponse |
| RunCodeAlignment | unary | exa.api_server_pb.RunCodeAlignmentRequest | exa.api_server_pb.RunCodeAlignmentResponse |
| GenerateSyntheticRule | unary | exa.api_server_pb.GenerateSyntheticRuleRequest | exa.api_server_pb.GenerateSyntheticRuleResponse |
| GetUserAllowlist | unary | exa.api_server_pb.GetUserAllowlistRequest | exa.api_server_pb.GetUserAllowlistResponse |
| InsertAllowlist | unary | exa.api_server_pb.InsertAllowlistRequest | exa.api_server_pb.InsertAllowlistResponse |
| DeleteAllowlist | unary | exa.api_server_pb.DeleteAllowlistRequest | exa.api_server_pb.DeleteAllowlistResponse |
| GetAllowlist | unary | exa.api_server_pb.GetAllowlistRequest | exa.api_server_pb.GetAllowlistResponse |
| RegisterHybridDeployment | unary | exa.api_server_pb.RegisterHybridDeploymentRequest | exa.api_server_pb.RegisterHybridDeploymentResponse |
| CreateHybridDeploymentInternal | unary | exa.api_server_pb.CreateHybridDeploymentInternalRequest | exa.api_server_pb.CreateHybridDeploymentInternalResponse |
| RemoveHybridDeploymentInternal | unary | exa.api_server_pb.RemoveHybridDeploymentInternalRequest | exa.api_server_pb.RemoveHybridDeploymentInternalResponse |
| GetHybridDeploymentsInternal | unary | exa.api_server_pb.GetHybridDeploymentsInternalRequest | exa.api_server_pb.GetHybridDeploymentsInternalResponse |
| CheckHybridDeploymentStatus | unary | exa.api_server_pb.CheckHybridDeploymentStatusRequest | exa.api_server_pb.CheckHybridDeploymentStatusResponse |
| LogCompletionsHybrid | unary | exa.api_server_pb.LogCompletionsHybridRequest | exa.api_server_pb.LogCompletionsHybridResponse |
| LogFeedbackHybrid | unary | exa.api_server_pb.LogFeedbackHybridRequest | exa.api_server_pb.LogFeedbackHybridResponse |
| LogChatHybrid | unary | exa.api_server_pb.LogChatHybridRequest | exa.api_server_pb.LogChatHybridResponse |
| GetStatus | unary | exa.api_server_pb.GetStatusRequest | exa.api_server_pb.GetStatusResponse |
| GetCascadeModelConfigs | unary | exa.api_server_pb.GetCascadeModelConfigsRequest | exa.api_server_pb.GetCascadeModelConfigsResponse |
| GetCommandModelConfigs | unary | exa.api_server_pb.GetCommandModelConfigsRequest | exa.api_server_pb.GetCommandModelConfigsResponse |
| GetMcpServerTemplates | unary | exa.api_server_pb.GetMcpServerTemplatesRequest | exa.api_server_pb.GetMcpServerTemplatesResponse |
| GetUnleashContextFields | unary | exa.api_server_pb.GetUnleashContextFieldsRequest | exa.api_server_pb.GetUnleashContextFieldsResponse |
| RecordTrajectorySegmentAnalytics | unary | exa.api_server_pb.RecordTrajectorySegmentAnalyticsRequest | exa.api_server_pb.RecordTrajectorySegmentAnalyticsResponse |
| RecordFullTrajectoryAnalytics | unary | exa.api_server_pb.RecordFullTrajectoryAnalyticsRequest | exa.api_server_pb.RecordFullTrajectoryAnalyticsResponse |
| RecordTrajectorySegmentEvents | unary | exa.api_server_pb.RecordTrajectorySegmentEventsRequest | exa.api_server_pb.RecordTrajectorySegmentEventsResponse |
| SupportsRemoteIndexing | unary | exa.api_server_pb.SupportsRemoteIndexingRequest | exa.api_server_pb.SupportsRemoteIndexingResponse |
| GetModelStatuses | unary | exa.api_server_pb.GetModelStatusesRequest | exa.api_server_pb.GetModelStatusesResponse |
| GetModelInfos | unary | exa.api_server_pb.GetModelInfosRequest | exa.api_server_pb.GetModelInfosResponse |
| GetDeploymentConfig | unary | exa.api_server_pb.GetDeploymentConfigRequest | exa.api_server_pb.GetDeploymentConfigResponse |
| UpsertDeploymentConfig | unary | exa.api_server_pb.UpsertDeploymentConfigRequest | exa.api_server_pb.UpsertDeploymentConfigResponse |
| RecordCascadeUsage | unary | exa.api_server_pb.RecordCascadeUsageRequest | exa.api_server_pb.RecordCascadeUsageResponse |
| ApplyTrajectoryHeuristics | unary | exa.api_server_pb.ApplyTrajectoryHeuristicsRequest | exa.api_server_pb.ApplyTrajectoryHeuristicsResponse |
| GetWebSearchResults | unary | exa.api_server_pb.GetWebSearchResultsRequest | exa.api_server_pb.GetWebSearchResultsResponse |
| GetWebDocsOptions | unary | exa.api_server_pb.GetWebDocsOptionsRequest | exa.api_server_pb.GetWebDocsOptionsResponse |
| GetWebSearchRedirect | unary | exa.api_server_pb.GetWebSearchRedirectRequest | exa.api_server_pb.GetWebSearchRedirectResponse |
| GetTranscription | unary | exa.api_server_pb.GetTranscriptionRequest | exa.api_server_pb.GetTranscriptionResponse |
| GetImageGeneration | unary | exa.api_server_pb.GetImageGenerationRequest | exa.api_server_pb.GetImageGenerationResponse |
| RegisterOidcProvider | unary | exa.api_server_pb.RegisterOidcProviderRequest | exa.api_server_pb.RegisterOidcProviderResponse |
| GetTeamOidcProviders | unary | exa.api_server_pb.GetTeamOidcProvidersRequest | exa.api_server_pb.GetTeamOidcProvidersResponse |
| GetAllOidcProviders | unary | exa.api_server_pb.GetAllOidcProvidersRequest | exa.api_server_pb.GetAllOidcProvidersResponse |
| DeleteOidcProvider | unary | exa.api_server_pb.DeleteOidcProviderRequest | exa.api_server_pb.DeleteOidcProviderResponse |
| GetOidcAuthorizationUrl | unary | exa.api_server_pb.GetOidcAuthorizationUrlRequest | exa.api_server_pb.GetOidcAuthorizationUrlResponse |
| ExchangeOidcCode | unary | exa.api_server_pb.ExchangeOidcCodeRequest | exa.api_server_pb.ExchangeOidcCodeResponse |
| RefreshOidcToken | unary | exa.api_server_pb.RefreshOidcTokenRequest | exa.api_server_pb.RefreshOidcTokenResponse |
| CreateTrajectoryShareStream | client_streaming | exa.api_server_pb.CreateTrajectoryShareStreamRequest | exa.api_server_pb.CreateTrajectoryShareStreamResponse |
| FetchTrajectoryShare | unary | exa.api_server_pb.FetchTrajectoryShareRequest | exa.api_server_pb.FetchTrajectoryShareResponse |
| DeleteTrajectoryShare | unary | exa.api_server_pb.DeleteTrajectoryShareRequest | exa.api_server_pb.DeleteTrajectoryShareResponse |
| FetchTrajectoryShareByUser | unary | exa.api_server_pb.FetchTrajectoryShareByUserRequest | exa.api_server_pb.FetchTrajectoryShareByUserResponse |
| GetCascadeNuxes | unary | exa.api_server_pb.GetCascadeNuxesRequest | exa.api_server_pb.GetCascadeNuxesResponse |
| IsConversationSharingBlocked | unary | exa.api_server_pb.IsConversationSharingBlockedRequest | exa.api_server_pb.IsConversationSharingBlockedResponse |
| StreamingTest | server_streaming | exa.api_server_pb.StreamingTestRequest | exa.api_server_pb.StreamingTestResponse |

## exa.extension_server_pb.ExtensionServerService  (53 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| LanguageServerStarted | unary | exa.extension_server_pb.LanguageServerStartedRequest | exa.extension_server_pb.LanguageServerStartedResponse |
| OpenSetting | unary | exa.extension_server_pb.OpenSettingRequest | exa.extension_server_pb.OpenSettingResponse |
| OpenFilePointer | unary | exa.extension_server_pb.OpenFilePointerRequest | exa.extension_server_pb.OpenFilePointerResponse |
| InsertCodeAtCursor | unary | exa.extension_server_pb.InsertCodeAtCursorRequest | exa.extension_server_pb.InsertCodeAtCursorResponse |
| LogEvent | unary | exa.extension_server_pb.LogEventRequest | exa.extension_server_pb.LogEventResponse |
| CheckTerminalShellSupport | unary | exa.extension_server_pb.CheckTerminalShellSupportRequest | exa.extension_server_pb.CheckTerminalShellSupportResponse |
| ExecuteCommand | server_streaming | exa.extension_server_pb.ExecuteCommandRequest | exa.codeium_common_pb.TerminalShellCommandStreamChunk |
| ShowTerminal | unary | exa.extension_server_pb.ShowTerminalRequest | exa.extension_server_pb.ShowTerminalResponse |
| SendTerminalInput | unary | exa.extension_server_pb.SendTerminalInputRequest | exa.extension_server_pb.SendTerminalInputResponse |
| TerminateCommand | unary | exa.extension_server_pb.TerminateCommandRequest | exa.extension_server_pb.TerminateCommandResponse |
| OpenVirtualFile | unary | exa.extension_server_pb.OpenVirtualFileRequest | exa.extension_server_pb.OpenVirtualFileResponse |
| SaveDocument | unary | exa.extension_server_pb.SaveDocumentRequest | exa.extension_server_pb.SaveDocumentResponse |
| ReadTerminal | unary | exa.extension_server_pb.ReadTerminalRequest | exa.extension_server_pb.ReadTerminalResponse |
| OpenTerminal | unary | exa.extension_server_pb.OpenTerminalRequest | exa.extension_server_pb.OpenTerminalResponse |
| GetLintErrors | unary | exa.extension_server_pb.GetLintErrorsRequest | exa.extension_server_pb.GetLintErrorsResponse |
| OpenDiffZones | unary | exa.extension_server_pb.OpenDiffZonesRequest | exa.extension_server_pb.OpenDiffZonesResponse |
| OpenExternalUrl | unary | exa.extension_server_pb.OpenExternalUrlRequest | exa.extension_server_pb.OpenExternalUrlResponse |
| HandleAsyncPostMessage | unary | exa.extension_server_pb.HandleAsyncPostMessageRequest | exa.extension_server_pb.HandleAsyncPostMessageResponse |
| PlaySound | unary | exa.extension_server_pb.PlaySoundRequest | exa.extension_server_pb.PlaySoundResponse |
| OpenAntigravityRulesFile | unary | exa.extension_server_pb.OpenAntigravityRulesFileRequest | exa.extension_server_pb.OpenAntigravityRulesFileResponse |
| OpenPluginPage | unary | exa.extension_server_pb.OpenPluginPageRequest | exa.extension_server_pb.OpenPluginPageResponse |
| OpenPluginConfigModal | unary | exa.extension_server_pb.OpenPluginConfigModalRequest | exa.extension_server_pb.OpenPluginConfigModalResponse |
| OpenConfigurePluginsPage | unary | exa.extension_server_pb.OpenConfigurePluginsPageRequest | exa.extension_server_pb.OpenConfigurePluginsPageResponse |
| OpenConversationWorkspaceQuickPick | unary | exa.extension_server_pb.OpenConversationWorkspaceQuickPickRequest | exa.extension_server_pb.OpenConversationWorkspaceQuickPickResponse |
| FindAllReferences | unary | exa.extension_server_pb.FindAllReferencesRequest | exa.extension_server_pb.FindAllReferencesResponse |
| GetDefinition | unary | exa.extension_server_pb.GetDefinitionRequest | exa.extension_server_pb.GetDefinitionResponse |
| TerminalResearchResult | unary | exa.extension_server_pb.TerminalResearchResultRequest | exa.extension_server_pb.TerminalResearchResultResponse |
| WriteCascadeEdit | unary | exa.extension_server_pb.WriteCascadeEditRequest | exa.extension_server_pb.WriteCascadeEditResponse |
| EditNotebook | unary | exa.extension_server_pb.EditNotebookRequest | exa.extension_server_pb.EditNotebookResponse |
| ReadNotebook | unary | exa.extension_server_pb.ReadNotebookRequest | exa.extension_server_pb.ReadNotebookResponse |
| ExecuteNotebook | unary | exa.extension_server_pb.ExecuteNotebookRequest | exa.extension_server_pb.ExecuteNotebookResponse |
| StartAudioRecording | unary | exa.extension_server_pb.StartAudioRecordingRequest | exa.extension_server_pb.StartAudioRecordingResponse |
| EndAudioRecording | unary | exa.extension_server_pb.EndAudioRecordingRequest | exa.extension_server_pb.EndAudioRecordingResponse |
| GetCurrentAudioRecording | unary | exa.extension_server_pb.GetCurrentAudioRecordingRequest | exa.extension_server_pb.GetCurrentAudioRecordingResponse |
| HandleProposeCodeExtensionVerification | unary | exa.extension_server_pb.HandleProposeCodeExtensionVerificationRequest | exa.extension_server_pb.HandleProposeCodeExtensionVerificationResponse |
| UpdateCascadeTrajectorySummaries | unary | exa.extension_server_pb.UpdateCascadeTrajectorySummariesRequest | exa.extension_server_pb.UpdateCascadeTrajectorySummariesResponse |
| RunExtensionCode | unary | exa.extension_server_pb.RunExtensionCodeRequest | exa.extension_server_pb.RunExtensionCodeResponse |
| UpdateDetailedViewWithCascadeInput | unary | exa.extension_server_pb.UpdateDetailedViewWithCascadeInputRequest | exa.extension_server_pb.UpdateDetailedViewWithCascadeInputResponse |
| GetSecretValue | unary | exa.extension_server_pb.GetSecretValueRequest | exa.extension_server_pb.GetSecretValueResponse |
| StoreSecretValue | unary | exa.extension_server_pb.StoreSecretValueRequest | exa.extension_server_pb.StoreSecretValueResponse |
| LaunchBrowser | unary | exa.extension_server_pb.LaunchBrowserRequest | exa.extension_server_pb.LaunchBrowserResponse |
| RestartUserStatusUpdater | unary | exa.extension_server_pb.RestartUserStatusUpdaterRequest | exa.extension_server_pb.RestartUserStatusUpdaterResponse |
| ShowConversationPicker | unary | exa.extension_server_pb.ConversationPickerRequest | exa.extension_server_pb.ConversationPickerResponse |
| GetBrowserOnboardingPort | unary | exa.extension_server_pb.GetBrowserOnboardingPortRequest | exa.extension_server_pb.GetBrowserOnboardingPortResponse |
| GetChromeDevtoolsMcpUrl | unary | exa.extension_server_pb.GetChromeDevtoolsMcpUrlRequest | exa.extension_server_pb.GetChromeDevtoolsMcpUrlResponse |
| FocusIDEWindow | unary | exa.extension_server_pb.FocusIDEWindowRequest | exa.extension_server_pb.FocusIDEWindowResponse |
| SmartFocusConversation | unary | exa.language_server_pb.SmartFocusConversationRequest | exa.language_server_pb.SmartFocusConversationResponse |
| IsAgentManagerEnabled | unary | exa.extension_server_pb.IsAgentManagerEnabledRequest | exa.extension_server_pb.IsAgentManagerEnabledResponse |
| RecordError | unary | exa.extension_server_pb.RecordErrorRequest | exa.extension_server_pb.RecordErrorResponse |
| SubscribeToUnifiedStateSyncTopic | server_streaming | exa.extension_server_pb.SubscribeToUnifiedStateSyncTopicRequest | exa.extension_server_pb.UnifiedStateSyncUpdate |
| PushUnifiedStateSyncUpdate | unary | exa.extension_server_pb.PushUnifiedStateSyncUpdateRequest | exa.extension_server_pb.PushUnifiedStateSyncUpdateResponse |
| BroadcastConversationDeletion | unary | exa.extension_server_pb.BroadcastConversationDeletionRequest | exa.extension_server_pb.BroadcastConversationDeletionResponse |
| Heartbeat | unary | exa.extension_server_pb.HeartbeatRequest | exa.extension_server_pb.HeartbeatResponse |

## exa.opensearch_clients_pb.KnowledgeBaseService  (20 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| KnowledgeBaseSearch | unary | exa.opensearch_clients_pb.KnowledgeBaseSearchRequest | exa.opensearch_clients_pb.KnowledgeBaseSearchResponse |
| GetKnowledgeBaseScopeItems | unary | exa.opensearch_clients_pb.GetKnowledgeBaseScopeItemsRequest | exa.opensearch_clients_pb.GetKnowledgeBaseScopeItemsResponse |
| GetKnowledgeBaseItemsFromScopeItems | unary | exa.opensearch_clients_pb.GetKnowledgeBaseItemsFromScopeItemsRequest | exa.opensearch_clients_pb.GetKnowledgeBaseItemsFromScopeItemsResponse |
| IngestSlackData | unary | exa.opensearch_clients_pb.IngestSlackDataRequest | exa.opensearch_clients_pb.IngestSlackDataResponse |
| IngestGithubData | unary | exa.opensearch_clients_pb.IngestGithubDataRequest | exa.opensearch_clients_pb.IngestGithubDataResponse |
| IngestGoogleDriveData | unary | exa.opensearch_clients_pb.IngestGoogleDriveDataRequest | exa.opensearch_clients_pb.IngestGoogleDriveDataResponse |
| IngestJiraData | unary | exa.opensearch_clients_pb.IngestJiraDataRequest | exa.opensearch_clients_pb.IngestJiraDataResponse |
| IngestJiraPayload | unary | exa.opensearch_clients_pb.IngestJiraPayloadRequest | exa.opensearch_clients_pb.IngestJiraPayloadResponse |
| ForwardSlackPayload | unary | exa.opensearch_clients_pb.ForwardSlackPayloadRequest | exa.opensearch_clients_pb.ForwardSlackPayloadResponse |
| IngestSlackPayload | unary | exa.opensearch_clients_pb.IngestSlackPayloadRequest | exa.opensearch_clients_pb.IngestSlackPayloadResponse |
| ConnectKnowledgeBaseAccount | unary | exa.opensearch_clients_pb.ConnectKnowledgeBaseAccountRequest | exa.opensearch_clients_pb.ConnectKnowledgeBaseAccountResponse |
| DeleteKnowledgeBaseConnection | unary | exa.opensearch_clients_pb.DeleteKnowledgeBaseConnectionRequest | exa.opensearch_clients_pb.DeleteKnowledgeBaseConnectionResponse |
| UpdateConnectorConfig | unary | exa.opensearch_clients_pb.UpdateConnectorConfigRequest | exa.opensearch_clients_pb.UpdateConnectorConfigResponse |
| CancelKnowledgeBaseJobs | unary | exa.opensearch_clients_pb.CancelKnowledgeBaseJobsRequest | exa.opensearch_clients_pb.CancelKnowledgeBaseJobsResponse |
| GetKnowledgeBaseConnectorState | unary | exa.opensearch_clients_pb.GetKnowledgeBaseConnectorStateRequest | exa.opensearch_clients_pb.GetKnowledgeBaseConnectorStateResponse |
| GetKnowledgeBaseJobStates | unary | exa.opensearch_clients_pb.GetKnowledgeBaseJobStatesRequest | exa.opensearch_clients_pb.GetKnowledgeBaseJobStatesResponse |
| AddUsers | unary | exa.opensearch_clients_pb.AddUsersRequest | exa.opensearch_clients_pb.AddUsersResponse |
| AddGithubUsers | unary | exa.opensearch_clients_pb.AddGithubUsersRequest | exa.opensearch_clients_pb.AddGithubUsersResponse |
| GetKnowledgeBaseWebhookUrl | unary | exa.opensearch_clients_pb.GetKnowledgeBaseWebhookUrlRequest | exa.opensearch_clients_pb.GetKnowledgeBaseWebhookUrlResponse |
| GetConnectorInternalConfig | unary | exa.opensearch_clients_pb.GetConnectorInternalConfigRequest | exa.opensearch_clients_pb.GetConnectorInternalConfigResponse |

## exa.index_pb.IndexManagementService  (19 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| EnableIndexing | unary | exa.index_pb.EnableIndexingRequest | exa.index_pb.EnableIndexingResponse |
| DisableIndexing | unary | exa.index_pb.DisableIndexingRequest | exa.index_pb.DisableIndexingResponse |
| AddRepository | unary | exa.index_pb.AddRepositoryRequest | exa.index_pb.AddRepositoryResponse |
| EditRepository | unary | exa.index_pb.EditRepositoryRequest | exa.index_pb.EditRepositoryResponse |
| DeleteRepository | unary | exa.index_pb.DeleteRepositoryRequest | exa.index_pb.DeleteRepositoryResponse |
| GetRepositories | unary | exa.index_pb.GetRepositoriesRequest | exa.index_pb.GetRepositoriesResponse |
| AddIndex | unary | exa.index_pb.AddIndexRequest | exa.index_pb.AddIndexResponse |
| CancelIndexing | unary | exa.index_pb.CancelIndexingRequest | exa.index_pb.CancelIndexingResponse |
| RetryIndexing | unary | exa.index_pb.RetryIndexingRequest | exa.index_pb.RetryIndexingResponse |
| DeleteIndex | unary | exa.index_pb.DeleteIndexRequest | exa.index_pb.DeleteIndexResponse |
| GetIndexes | unary | exa.index_pb.GetIndexesRequest | exa.index_pb.GetIndexesResponse |
| GetIndex | unary | exa.index_pb.GetIndexRequest | exa.index_pb.GetIndexResponse |
| GetRemoteIndexStats | unary | exa.index_pb.GetRemoteIndexStatsRequest | exa.index_pb.GetRemoteIndexStatsResponse |
| PruneDatabase | unary | exa.index_pb.PruneDatabaseRequest | exa.index_pb.PruneDatabaseResponse |
| GetDatabaseStats | unary | exa.index_pb.GetDatabaseStatsRequest | exa.index_pb.GetDatabaseStatsResponse |
| SetIndexConfig | unary | exa.index_pb.SetIndexConfigRequest | exa.index_pb.SetIndexConfigResponse |
| GetIndexConfig | unary | exa.index_pb.GetIndexConfigRequest | exa.index_pb.GetIndexConfigResponse |
| GetNumberConnections | unary | exa.index_pb.GetNumberConnectionsRequest | exa.index_pb.GetNumberConnectionsResponse |
| GetConnectionsDebugInfo | unary | exa.index_pb.GetConnectionsDebugInfoRequest | exa.index_pb.GetConnectionsDebugInfoResponse |

## google.internal.cloud.code.v1internal.JetskiService  (15 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ListAgentPlugins | unary | google.internal.cloud.code.v1internal.ListAgentPluginsRequest | google.internal.cloud.code.v1internal.ListAgentPluginsResponse |
| ListBuildWithGooglePlugins | unary | google.internal.cloud.code.v1internal.ListBuildWithGooglePluginsRequest | google.internal.cloud.code.v1internal.ListBuildWithGooglePluginsResponse |
| GetAgentPlugin | unary | google.internal.cloud.code.v1internal.GetAgentPluginRequest | google.internal.cloud.code.v1internal.AgentPlugin |
| ListCascadeNuxes | unary | google.internal.cloud.code.v1internal.ListCascadeNuxesRequest | google.internal.cloud.code.v1internal.ListCascadeNuxesResponse |
| ListWebDocsOptions | unary | google.internal.cloud.code.v1internal.ListWebDocsOptionsRequest | google.internal.cloud.code.v1internal.ListWebDocsOptionsResponse |
| RewriteUri | unary | google.internal.cloud.code.v1internal.RewriteUriRequest | google.internal.cloud.code.v1internal.RewriteUriResponse |
| FetchUserInfo | unary | google.internal.cloud.code.v1internal.FetchUserInfoRequest | google.internal.cloud.code.v1internal.FetchUserInfoResponse |
| SetUserSettings | unary | google.internal.cloud.code.v1internal.SetUserSettingsRequest | google.internal.cloud.code.v1internal.SetUserSettingsResponse |
| TabChat | server_streaming | google.internal.cloud.code.v1internal.TabChatRequest | google.internal.cloud.code.v1internal.TabChatResponse |
| CheckUrlDenylist | unary | google.internal.cloud.code.v1internal.CheckUrlDenylistRequest | google.internal.cloud.code.v1internal.CheckUrlDenylistResponse |
| GetHealth | unary | google.internal.cloud.code.v1internal.GetHealthRequest | google.internal.cloud.code.v1internal.Health |
| RecordTrajectoryAnalytics | unary | google.internal.cloud.code.v1internal.RecordTrajectoryAnalyticsRequest | google.internal.cloud.code.v1internal.RecordTrajectoryAnalyticsResponse |
| FetchFromTrawlerCache | unary | google.internal.cloud.code.v1internal.FetchFromTrawlerCacheRequest | google.internal.cloud.code.v1internal.FetchFromTrawlerCacheResponse |
| RegisterInteraction | unary | google.internal.cloud.code.v1internal.RegisterInteractionRequest | google.internal.cloud.code.v1internal.RegisterInteractionResponse |
| BattleModeOverrides | unary | google.internal.cloud.code.v1internal.BattleModeOverridesRequest | google.internal.cloud.code.v1internal.BattleModeOverridesResponse |

## devtools.ai.frontend.Cog  (9 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ListWorkspaces | unary | cider.ListWorkspacesRequest | cider.ListWorkspacesResponse |
| GetWorkspaceDetails | unary | cider.GetWorkspaceDetailsRequest | cider.GetWorkspaceDetailsResponse |
| StatFile | unary | cider.FileStatRequest | cider.FileStatResponse |
| ReadWorkspaceFiles | unary | cider.ReadWorkspaceFilesRequest | cider.ReadFilesResponse |
| GetDrafts | unary | devtools_cog.GetDraftsRequest | devtools_cog.GetDraftsResponse |
| GetMainRepo | unary | devtools_cog.GetMainRepoRequest | devtools_cog.GetMainRepoResponse |
| GetModifiedRepos | unary | devtools_cog.GetModifiedReposRequest | devtools_cog.GetModifiedReposResponse |
| GetEnclosingRepo | unary | devtools_cog.GetEnclosingRepoRequest | devtools_cog.GetEnclosingRepoResponse |
| GetRepoStates | unary | devtools_cog.GetRepoStatesRequest | devtools_cog.GetRepoStatesResponse |

## devtools.ai.frontend.Piper  (8 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ListWorkspaces | unary | cider.ListWorkspacesRequest | cider.ListWorkspacesResponse |
| GetWorkspaceDetails | unary | cider.GetWorkspaceDetailsRequest | cider.GetWorkspaceDetailsResponse |
| StatFile | unary | cider.FileStatRequest | cider.FileStatResponse |
| ReadWorkspaceFiles | unary | cider.ReadWorkspaceFilesRequest | cider.ReadFilesResponse |
| CreateWorkspace | unary | cider.CreateWorkspaceRequest | cider.CreateWorkspaceResponse |
| DeleteWorkspace | unary | devtools.ai.frontend.PiperDeleteWorkspaceRequest | devtools.ai.frontend.PiperDeleteWorkspaceResponse |
| WorkspaceData | unary | cider.WorkspaceDataRequest | cider.WorkspaceDataResponse |
| GetChangelists | unary | cider.GetChangelistsRequest | cider.GetChangelistsResponse |

## exa.analytics_pb.AnalyticsService  (7 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| RecordCommandUsage | unary | exa.analytics_pb.RecordCommandUsageRequest | exa.analytics_pb.RecordCommandUsageResponse |
| RecordCompletions | unary | exa.analytics_pb.RecordCompletionsRequest | exa.analytics_pb.RecordCompletionsResponse |
| RecordContextToPrompt | unary | exa.analytics_pb.RecordContextToPromptRequest | exa.analytics_pb.RecordContextToPromptResponse |
| RecordCortexTrajectory | unary | exa.analytics_pb.RecordCortexTrajectoryRequest | exa.analytics_pb.RecordCortexTrajectoryResponse |
| RecordCortexTrajectoryStep | unary | exa.analytics_pb.RecordCortexTrajectoryStepRequest | exa.analytics_pb.RecordCortexTrajectoryStepResponse |
| BatchRecordPrompts | unary | exa.analytics_pb.BatchRecordPromptsRequest | exa.analytics_pb.BatchRecordPromptsResponse |
| BatchRecordCompletions | unary | exa.analytics_pb.BatchRecordCompletionsRequest | exa.analytics_pb.BatchRecordCompletionsResponse |

## devtools.ai.frontend.Fig  (5 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ListRevisions | unary | cider.ListFigRevisionsRequest | cider.ListFigRevisionsResponse |
| ListRevisionsNew | unary | devtools.cider.frontend.fig.ListRevisionsRequest | devtools.cider.frontend.fig.ListRevisionsResponse |
| CreateWorkspace | unary | cider.CreateWorkspaceRequest | cider.CreateWorkspaceResponse |
| DeleteWorkspace | unary | devtools.ai.frontend.FigDeleteWorkspaceRequest | devtools.ai.frontend.FigDeleteWorkspaceResponse |
| Checkout | unary | devtools.cider.frontend.fig.CheckoutRequest | devtools.cider.frontend.fig.CheckoutResponse |

## devtools.ai.frontend.Buganizer  (4 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ListHotlistEntries | unary | devtools.sourcerers.buganizer.ListHotlistEntriesRequest | devtools.sourcerers.buganizer.ListHotlistEntriesResponse |
| CreateIssue | unary | google.devtools.issuetracker.v1.CreateIssueRequest | devtools.sourcerers.buganizer.CiderCreateIssueResponse |
| CreateIssueComment | unary | google.devtools.issuetracker.v1.CreateIssueCommentRequest | google.devtools.issuetracker.v1.IssueComment |
| CreateAttachment | unary | google.devtools.issuetracker.v1.CreateAttachmentRequest | google.devtools.issuetracker.v1.Attachment |

## exa.index_pb.IndexService  (4 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| GetIndexedRepositories | unary | exa.index_pb.GetIndexedRepositoriesRequest | exa.index_pb.GetIndexedRepositoriesResponse |
| GetNearestCCIsFromEmbedding | unary | exa.index_pb.GetNearestCCIsFromEmbeddingRequest | exa.index_pb.GetNearestCCIsFromEmbeddingResponse |
| GetEmbeddingsForCodeContextItems | unary | exa.index_pb.GetEmbeddingsForCodeContextItemsRequest | exa.index_pb.GetEmbeddingsForCodeContextItemsResponse |
| GetMatchingFilePaths | unary | exa.index_pb.GetMatchingFilePathsRequest | exa.index_pb.GetMatchingFilePathsResponse |

## exa.opensearch_clients_pb.CodeIndexService  (4 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| OpenSearchAddRepository | unary | exa.opensearch_clients_pb.OpenSearchAddRepositoryRequest | exa.opensearch_clients_pb.OpenSearchAddRepositoryResponse |
| OpenSearchGetIndex | unary | exa.opensearch_clients_pb.OpenSearchGetIndexRequest | exa.opensearch_clients_pb.OpenSearchGetIndexResponse |
| HybridSearch | unary | exa.opensearch_clients_pb.HybridSearchRequest | exa.opensearch_clients_pb.HybridSearchResponse |
| GraphSearch | unary | exa.opensearch_clients_pb.GraphSearchRequest | exa.opensearch_clients_pb.GraphSearchResponse |

## devtools.ai.frontend.Jj  (3 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| GetWorkspaceState | unary | cider.GetJjWorkspaceStateRequest | cider.GetJjWorkspaceStateResponse |
| CreateWorkingCopy | unary | devtools.ai.frontend.CreateJjWorkingCopyRequest | devtools.ai.frontend.CreateJjWorkingCopyResponse |
| DeleteWorkingCopy | unary | devtools.ai.frontend.DeleteJjWorkingCopyRequest | devtools.ai.frontend.DeleteJjWorkingCopyResponse |

## exa.cascade_plugins_pb.CascadePluginsService  (3 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| GetAvailableCascadePlugins | unary | exa.cascade_plugins_pb.GetAvailableCascadePluginsRequest | exa.cascade_plugins_pb.GetAvailableCascadePluginsResponse |
| InstallCascadePlugin | unary | exa.cascade_plugins_pb.InstallCascadePluginRequest | exa.cascade_plugins_pb.InstallCascadePluginResponse |
| GetCascadePluginById | unary | exa.cascade_plugins_pb.GetCascadePluginByIdRequest | exa.cascade_plugins_pb.GetCascadePluginByIdResponse |

## devtools.ai.frontend.ServerInfo  (1 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| GetVersion | unary | devtools.ai.frontend.GetVersionRequest | devtools.ai.frontend.GetVersionResponse |

## devtools.ai.frontend.Pen  (1 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| ResolvePen | unary | devtools.ai.frontend.ResolvePenRequest | devtools.ai.frontend.ResolvePenResponse |

## devtools.ai.frontend.CodeSearch  (1 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| Search | unary | cider.CodeSearchRequest | cider.CodeSearchResponse |

## devtools.ai.frontend.Acl  (1 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| Exists | unary | devtools.ai.frontend.AclExistsRequest | devtools.ai.frontend.AclExistsResponse |

## exa.api_server_pb.EvalApiServerService  (1 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| GetChatMessage | server_streaming | exa.api_server_pb.GetChatMessageRequest | exa.api_server_pb.GetChatMessageResponse |

## exa.chat_client_server_pb.ChatClientServerService  (1 methods)

| Method | Kind | Input | Output |
|---|---|---|---|
| StartChatClientRequestStream | server_streaming | exa.chat_client_server_pb.StartChatClientRequestStreamRequest | exa.chat_client_server_pb.ChatClientRequest |

## devtools.ai.frontend.Frontend  (0 methods)

| Method | Kind | Input | Output |
|---|---|---|---|

