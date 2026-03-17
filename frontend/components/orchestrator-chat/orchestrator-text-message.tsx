'use client';

import { memo } from 'react';
import type { OrchestratorChatMessage } from '@/lib/orchestrator-chat-types';
import { MarkdownRenderer } from '@/components/markdown-renderer';

interface Props {
    message: OrchestratorChatMessage;
}

export const OrchestratorTextMessage = memo(function OrchestratorTextMessage({ message }: Props) {
    const isUser = message.role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                isUser
                    ? 'bg-blue-600/20 text-blue-100 rounded-br-sm'
                    : 'bg-purple-600/10 text-purple-100 rounded-bl-sm'
            }`}>
                {isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <MarkdownRenderer content={message.content} />
                )}
            </div>
        </div>
    );
});
