// === Antigravity Deck Types ===

export interface StepMetadata {
    argumentsJson?: string;
    resultJson?: string;
    name?: string;
    createdAt?: string;
    generatorModel?: string;
    toolCallOutputTokens?: number;
    requestedModel?: { model?: string };
    toolCall?: {
        id?: string;
        name?: string;
        argumentsJson?: string;
    };
}

export interface Step {
    type: string;
    status: string;
    metadata?: StepMetadata;
    userInput?: { items?: Array<{ text?: string }>; userResponse?: string; media?: Array<{ mimeType?: string; inlineData?: string; uri?: string; thumbnail?: string }>;[key: string]: unknown };
    plannerResponse?: {
        modifiedResponse?: string;
        response?: string;
        thinking?: string;
        text?: string;
        content?: string;
        responseItems?: Array<{ text?: string }>;
        toolCalls?: Array<{
            id?: string;
            name?: string;
            argumentsJson?: string;
        }>;
        messageId?: string;
    };
    notifyUser?: {
        notificationContent?: string;
        message?: string;
        reviewAbsoluteUris?: string[];
        isBlocking?: boolean;
        askForUserFeedback?: boolean;
    };
    codeAction?: {
        actionSpec?: {
            command?: {
                instruction?: string;
                description?: string;
                replacementChunks?: Array<{ targetFile?: string }>;
            };
        };
        targetFile?: string;
        filePath?: string;
        description?: string;
        instruction?: string;
    };
    codeAcknowledgement?: {
        isAccept?: boolean;
        acknowledgementScope?: string;
        codeAcknowledgementInfos?: Array<{
            uriPath?: string;
            stepIndices?: number[];
            diff?: {
                lines?: Array<{ text?: string; type?: string }>;
            };
        }>;
    };
    runCommand?: { commandLine?: string; command?: string };
    sendCommandInput?: {
        commandId?: string;
        input?: string;
        terminate?: boolean;
        output?: { full?: string };
    };
    commandStatus?: { output?: { full?: string } };
    taskBoundary?: {
        taskName?: string;
        taskStatus?: string;
        taskSummary?: string;
    };
    viewFile?: {
        absolutePath?: string;
        filePath?: string;
        startLine?: number;
        endLine?: number;
    };
    listDirectory?: { directoryPath?: string };
    browserSubagent?: { task?: string; description?: string };
    subtrajectory?: { steps?: Step[] };
    readUrlContent?: { url?: string };
    viewContentChunk?: { position?: number; documentId?: string };
    errorMessage?: string | { message?: string; error?: string | { userErrorMessage?: string; shortError?: string; message?: string;[key: string]: unknown };[key: string]: unknown };
    ephemeralMessage?: { content?: string };
    checkpoint?: {
        modelName?: string;
        model?: string;
        inputTokens?: number;
        totalTokens?: number;
    };
    conversationHistory?: unknown;
    generateImage?: {
        prompt?: string;
        imageName?: string;
        modelName?: string;
        generatedMedia?: {
            mimeType?: string;
            inlineData?: string;
            uri?: string;
        };
    };
    grepSearch?: unknown;
    find?: unknown;
}

export interface StepDisplayConfig {
    role: 'user' | 'thinking' | 'response' | 'tool' | 'system' | 'error';
    icon: string;
    label: string;
    show: boolean;
    collapsible?: boolean;
}

export interface TrajectorySummary {
    summary?: string;
    stepCount?: number;
    status?: string;
    lastModifiedTime?: string;
    createdTime?: string;
}

export interface ConversationsResponse {
    trajectorySummaries?: Record<string, TrajectorySummary>;
}

export interface StepStats {
    total: number;
    user: number;
    agent: number;
    tool: number;
    system: number;
    error: number;
    typeCounts: Record<string, number>;
}
