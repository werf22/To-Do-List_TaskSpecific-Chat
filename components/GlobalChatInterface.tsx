// components/GlobalChatInterface.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PaperPlaneIcon } from '@radix-ui/react-icons';

// Basic props for a global chat (can be extended later)
interface GlobalChatInterfaceProps {}

export function GlobalChatInterface({}: GlobalChatInterfaceProps) {
    const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
        api: '/api/ai/global-chat', // Point to the new global chat API
        initialMessages: [
            { id: 'initial-1', role: 'assistant', content: 'Hello! How can I help you today?' },
        ],
        onError: (error: Error) => {
            console.error("Global Chat Hook Error:", error);
            // Maybe show a toast notification to the user
        },
    });

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    // Effect to scroll down messages
    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [messages]);

    // Simple form submit handler
    const handleFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        handleSubmit(e);
    }, [input, handleSubmit, isLoading]);

    return (
        <div className="flex flex-col h-full border rounded-lg p-4 space-y-4 bg-background text-foreground shadow-sm">
            {/* Chat Messages Area */}
            <ScrollArea className="flex-1 w-full pr-4" ref={scrollAreaRef}>
                <div className="space-y-4">
                    {messages.map((m: Message) => (
                        <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                            {m.role === 'assistant' && (
                                <Avatar className="w-8 h-8 border">
                                    <AvatarFallback>AI</AvatarFallback>
                                </Avatar>
                            )}
                            <div
                                className={`rounded-lg px-3 py-2 max-w-[75%] whitespace-pre-wrap text-sm ${m.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                    }`}
                            >
                                {m.content}
                            </div>
                            {m.role === 'user' && (
                                <Avatar className="w-8 h-8 border">
                                    <AvatarFallback>U</AvatarFallback>
                                </Avatar>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start gap-3">
                            <Avatar className="w-8 h-8 border">
                                <AvatarFallback>AI</AvatarFallback>
                            </Avatar>
                            <div className="rounded-lg px-3 py-2 bg-muted text-muted-foreground animate-pulse">
                                Thinking...
                            </div>
                        </div>
                    )}
                    {error && (
                         <div className="flex justify-start gap-3">
                            <Avatar className="w-8 h-8 border border-destructive">
                                <AvatarFallback>!</AvatarFallback>
                            </Avatar>
                            <div className="rounded-lg px-3 py-2 bg-destructive/10 text-destructive font-medium">
                                Error: {error.message}
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Input Form */}
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2 pt-4 border-t border-border">
                <Input
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Ask anything..."
                    className="flex-1 h-10"
                    disabled={isLoading}
                />
                <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                    <PaperPlaneIcon className="h-4 w-4" />
                </Button>
            </form>
        </div>
    );
}
