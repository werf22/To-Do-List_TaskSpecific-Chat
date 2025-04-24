'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PaperPlaneIcon, ReloadIcon, UpdateIcon } from '@radix-ui/react-icons'; 
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'; 
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; 
import { MODEL_CONFIGS, getModelConfig, ModelIdentifier, ReasoningEffortValue, MODEL_IDS } from '@/config/aiConfig'; 
import { Task } from '@prisma/client';

const DEFAULT_MODEL_ID: ModelIdentifier = MODEL_IDS.O4_MINI;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_REASONING_EFFORT: ReasoningEffortValue = 'medium';

interface AIChatInterfaceProps {
    taskId: string;
    taskData: Task | null;
    onTaskUpdated?: () => void;
}

export function AIChatInterface({ taskId, taskData, onTaskUpdated }: AIChatInterfaceProps) {
    // State for UI controls
    const [selectedModel, setSelectedModel] = useState<ModelIdentifier>(DEFAULT_MODEL_ID); 
    const [temperature, setTemperature] = useState<number>(DEFAULT_TEMPERATURE);
    const [maxTokens, setMaxTokens] = useState<number>(DEFAULT_MAX_TOKENS);
    const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffortValue>(DEFAULT_REASONING_EFFORT);
    const [isManualUpdating, setIsManualUpdating] = useState<boolean>(false); 

    // Get current model config
    const modelConfig = useMemo(() => getModelConfig(selectedModel), [selectedModel]);

    // Memoize the body for useChat hook 
    const chatBody = useMemo(() => {
        const baseOptions = {
            // taskId is added in the main body below
        };

        const providerOpts: Record<string, any> = {};
        // Add temperature to providerOpts if supported
        if (modelConfig?.supportsTemperature) {
            providerOpts.temperature = temperature;
        }
        if (modelConfig?.supportsReasoningEffort) {
            // Nest reasoningEffort under provider-specific key if needed,
            // or directly if the backend handles it generically. Assuming direct for now.
            providerOpts.reasoningEffort = reasoningEffort;
        }

        // Conditionally add maxTokens ONLY for GPT41
        const conditionalOptions: { maxTokens?: number } = {};
        if (selectedModel === MODEL_IDS.GPT41) {
            conditionalOptions.maxTokens = maxTokens;
        }

        return {
            ...baseOptions,
            ...conditionalOptions, // Add conditional options (e.g., maxTokens)
            // Only return providerOptions if it has keys
            ...(Object.keys(providerOpts).length > 0 ? { providerOptions: providerOpts } : {})
        };
    }, [selectedModel, taskId, temperature, maxTokens, reasoningEffort, modelConfig]);

    // Construct options dynamically based on model
    const chatOptions = useMemo(() => {
        const baseOptions = {
            id: `task-${taskId}`,
            initialMessages: [],
            body: {
                modelId: selectedModel, // Send the selected model ID
                taskId: taskId, // Include taskId in the body
            },
            headers: { 'Content-Type': 'application/json' },
            api: '/api/ai/chat',
            onFinish: (message: Message) => {
                const toolUpdateOccurred = (message as any).role === 'tool' && 
                                         (message as any).toolResult?.toolName === 'updateTaskFields' && 
                                         (message as any).toolResult?.success === true;
                if (toolUpdateOccurred) {
                     console.log("[AIChatInterface] Detected successful task update via tool in onFinish.");
                     if (onTaskUpdated) {
                         console.log("[AIChatInterface] Calling onTaskUpdated callback.");
                         onTaskUpdated();
                     }
                 } else {
                     console.log("[AIChatInterface] onFinish called, no task update detected.");
                 }
            },
            onError: (error: Error) => {
                console.error("Chat Hook Error:", error);
            },
        };

        return {
            ...baseOptions,
            body: {
                ...baseOptions.body,
                // Merge maxTokens from chatBody
                ...(chatBody.maxTokens && { maxTokens: chatBody.maxTokens }),
                // Merge providerOptions from chatBody if it exists
                ...(chatBody.providerOptions && { providerOptions: chatBody.providerOptions })
            }
        };
    }, [selectedModel, taskId, chatBody, onTaskUpdated]); // Added dependencies

    // --- Frontend Verification Logs --- 
    console.log(`[AIChatInterface] Preparing useChat hook. taskId: ${taskId}, selectedModel: ${selectedModel}`);

    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        setInput,
        append,
        reload,
        stop,
        isLoading: isChatLoading, // Renamed
        error,
        data, // Additional data from API response
    } = useChat(chatOptions); // *** Use the dynamic chatOptions here ***

    // Handler for the dedicated 'Update Task' button 
    const handleUpdateClick = useCallback(async () => {
        if (!taskId || isChatLoading || isManualUpdating) return; // Use isChatLoading
        setIsManualUpdating(true); 

        try {
            await append(
                { role: 'user', content: `Based on our conversation, please update the task fields now using the 'updateTaskFields' tool.` },
                { body: { ...chatBody, isUpdateButtonClick: true } } 
            );
        } catch (err) {
            console.error("Error during manual update append:", err);
            // Append error message to chat
            append({ id: `error-${Date.now()}`, role: 'assistant', content: `Error initiating update: ${(err as Error).message}`});
        } finally {
            // Reset button-specific state immediately after append call finishes/fails
            setIsManualUpdating(false);
        }
    }, [taskId, isChatLoading, isManualUpdating, append, chatBody]); // Use isChatLoading, removed setMessages

    // Wrapper for form submission 
    const handleFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input.trim() || isChatLoading || isManualUpdating) return; // Use isChatLoading
        console.log('[AIChatInterface] handleFormSubmit called. Submitting with body:', chatBody);
        // Pass the body override directly as the second argument's options
        handleSubmit(e, {
             body: chatBody
        });
    }, [input, handleSubmit, chatBody, isChatLoading, isManualUpdating]); // Use isChatLoading

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    // Effect to scroll down messages
    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [messages]);

    // Effect to reset state when task ID changes
    useEffect(() => {
        if (taskId) { 
            console.log("[AIChatInterface] Task ID changed to:", taskId, " - Resetting input and settings.");
            setInput('');
            setSelectedModel(DEFAULT_MODEL_ID);
            setTemperature(DEFAULT_TEMPERATURE);
            setMaxTokens(DEFAULT_MAX_TOKENS);
            setReasoningEffort(DEFAULT_REASONING_EFFORT);
        }
    }, [taskId, setInput]); // Removed setMessages dependency

    return (
        <TooltipProvider delayDuration={100}>
            <div className="flex flex-col h-[600px] border rounded-lg p-4 space-y-4 bg-background text-foreground shadow-sm">
                {/* Controls Header */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center px-2 pb-3 border-b border-border flex-wrap"> 
                    {/* Model Selection */}
                    <div className="flex-1 min-w-[150px]">
                        <Label htmlFor="ai-model-select" className="text-xs mb-1 block text-muted-foreground">AI Model</Label>
                        <Select
                            value={selectedModel}
                            onValueChange={(value: string) => setSelectedModel(value as ModelIdentifier)}
                            disabled={isChatLoading}
                        >
                            <SelectTrigger id="ai-model-select" className="h-8 text-xs bg-input border-input focus:ring-ring focus:ring-1">
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent className="text-xs bg-popover text-popover-foreground">
                                {MODEL_CONFIGS.map(config => (
                                    <SelectItem key={config.id} value={config.id} className="text-xs">
                                        {config.displayName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Temperature Slider */}
                    {modelConfig?.supportsTemperature && (
                        <div className={`flex-1 min-w-[150px]`}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div>
                                        <Label htmlFor="temperature-slider" className="text-xs mb-1 block text-muted-foreground">
                                            Temperature: {temperature.toFixed(1)}
                                        </Label>
                                        <Slider
                                            id="temperature-slider"
                                            min={0.0} max={2.0} step={0.1}
                                            value={[temperature]}
                                            onValueChange={(value: number[]) => setTemperature(value[0])}
                                            disabled={isChatLoading}
                                            className="h-8 py-3 data-[disabled]:opacity-50" 
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-xs bg-popover text-popover-foreground border border-border shadow-md">
                                    Higher = more random, Lower = more focused. (Default: {DEFAULT_TEMPERATURE})
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}

                    {/* Max Tokens Slider */}
                    {modelConfig?.supportsTemperature && modelConfig.maxTokensLimit > 0 && (
                        <div className="flex-1 min-w-[150px]">
                            <Tooltip>
                                 <TooltipTrigger asChild>
                                    <div>
                                        <Label htmlFor="max-tokens-slider" className="text-xs mb-1 block text-muted-foreground">
                                            Max Tokens: {maxTokens}
                                        </Label>
                                        <Slider
                                            id="max-tokens-slider"
                                            min={512} 
                                            max={modelConfig.maxTokensLimit} // Use dynamic max
                                            step={128} 
                                            value={[maxTokens]}
                                            onValueChange={(value: number[]) => setMaxTokens(value[0])}
                                            disabled={isChatLoading}
                                            className="h-8 py-3 data-[disabled]:opacity-50" 
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-xs bg-popover text-popover-foreground border border-border shadow-md">
                                    Max response length. (Default: {DEFAULT_MAX_TOKENS})
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}

                    {/* Reasoning Effort Slider - Only for o4-mini */}
                    {modelConfig?.supportsReasoningEffort && (
                        <div className="flex-1 min-w-[150px]">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center space-x-2">
                                        <Label htmlFor="reasoning-effort-slider" className="text-xs font-normal">Effort</Label>
                                        <Select 
                                            value={reasoningEffort}
                                            onValueChange={(value: string) => setReasoningEffort(value as ReasoningEffortValue)}
                                            disabled={isChatLoading}
                                        >
                                            <SelectTrigger id="reasoning-effort-select" className="h-8 text-xs bg-input border-input focus:ring-ring focus:ring-1">
                                                <SelectValue placeholder="Select effort" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="low" className="text-xs">Low</SelectItem>
                                                <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                                                <SelectItem value="high" className="text-xs">High</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-xs bg-popover text-popover-foreground border border-border shadow-md">
                                    'o4-mini' reasoning amount. Higher effort -&gt; slower, maybe better. (Default: {DEFAULT_REASONING_EFFORT})
                                </TooltipContent>
                            </Tooltip>
                         </div>
                    )}
                </div>

                {/* Chat Messages Area */}
                <ScrollArea className="flex-grow bg-muted/20 rounded-md p-4 border border-border" ref={scrollAreaRef}>
                    <div className="space-y-4">
                        {messages.length === 0 && !isChatLoading && (
                             <div className="text-center text-muted-foreground text-sm py-8">Start the conversation below.</div>
                        )}
                        {messages.map((m: Message) => (
                            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex items-start gap-2 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}> 
                                    <Avatar className="w-6 h-6 border shrink-0"> 
                                        <AvatarFallback className="text-xs">{m.role === 'user' ? 'U' : 'AI'}</AvatarFallback>
                                    </Avatar>
                                    <div className={`rounded-lg px-3 py-2 shadow-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground border'}`}>
                                        {/* Render tool calls (requests) */}
                                        {(m as any).toolInvocations?.map((toolInvocation: any) => (
                                             <div key={`${m.id}-tool-${toolInvocation.toolCallId}`} className="my-1 p-2 border rounded bg-muted/60 text-xs">
                                                 {toolInvocation.toolName === 'updateTaskFields' ? ( // Display specific text for our tool
                                                      <>
                                                          <p className="font-semibold text-foreground">Updating task fields...</p>
                                                          {/* Optional: display args for debug */}
                                                          {/* <pre className="text-muted-foreground whitespace-pre-wrap break-all text-[10px] mt-1">Args: {JSON.stringify(toolInvocation.args, null, 1)}</pre> */}
                                                      </>
                                                 ) : (
                                                     <p className="font-semibold">Tool Request: {toolInvocation.toolName}</p> // Generic display for other tools
                                                 )}
                                             </div>
                                         ))}
                                        {/* Render tool results (if the message has them) */}
                                        {(m as any).role === 'tool' && (m as any).toolResult != null && (
                                             <div className="my-1 p-2 border border-green-600/50 rounded bg-green-100/50 dark:bg-green-900/30 text-xs">
                                                  <p className="font-semibold text-green-800 dark:text-green-300">Tool Result ({(m as any).toolResult.toolName}):</p>
                                                  <div className="text-green-700 dark:text-green-400 mt-1 p-1 bg-background/30 border border-border/30 rounded-sm overflow-x-auto whitespace-pre-wrap break-all text-[10px]">
                                                     {/* Display based on the assumed structure from execute-tool API */}
                                                     {typeof (m as any).toolResult.result === 'object' ? JSON.stringify((m as any).toolResult.result, null, 1) : String((m as any).toolResult.result)}
                                                  </div>
                                             </div>
                                         )}
                                        {/* Render regular text content */}
                                        {typeof m.content === 'string' && m.content.trim() !== '' && (
                                            <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                                         )}
                                        {/* Handle cases where content might be empty or just whitespace after tool display */}
                                        {typeof m.content !== 'string' && !m.toolInvocations?.length && (
                                             <p className="text-sm text-muted-foreground italic">[Non-text content]</p>
                                         )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* More precise loading indicator */}
                        {isChatLoading && (!messages.length || messages[messages.length - 1]?.role === 'user') && (
                             <div className="flex justify-start">
                                <div className="flex items-start gap-2 max-w-[75%]">
                                    <Avatar className="w-6 h-6 border shrink-0"><AvatarFallback className="text-xs">AI</AvatarFallback></Avatar>
                                    <div className="rounded-lg px-3 py-2 bg-card border"><p className="text-sm text-muted-foreground animate-pulse">Thinking...</p></div>
                                </div>
                            </div>
                        )}
                        {/* Display API/hook error */}
                         {error && (
                           <div className="text-red-600 dark:text-red-400 text-sm p-2 border border-red-500/50 bg-red-500/10 rounded-md">
                             Error: {error.message || 'An unknown error occurred.'}
                           </div>
                         )}
                    </div>
                </ScrollArea>

                {/* Input Area */}
                <form onSubmit={handleFormSubmit} className="flex items-center gap-2 pt-2 border-t border-border">
                    <Input
                        value={input}
                        onChange={handleInputChange}
                        placeholder="Ask AI to help with the task..."
                        disabled={isChatLoading}
                        className="flex-grow bg-input border-input text-sm"
                    />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button type="button" variant="outline" size="icon" onClick={handleUpdateClick} disabled={isChatLoading || !taskId} className="shrink-0">
                                <UpdateIcon className={`h-4 w-4 ${isManualUpdating ? 'animate-spin' : ''}`} />
                                <span className="sr-only">Update Task Fields</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs bg-popover text-popover-foreground border border-border shadow-md">Explicitly update task</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button type="submit" size="icon" disabled={isChatLoading || !input.trim()} className="shrink-0">
                                <PaperPlaneIcon className="h-4 w-4" />
                                <span className="sr-only">Send message</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs bg-popover text-popover-foreground border border-border shadow-md">Send message</TooltipContent>
                    </Tooltip>
                    {isChatLoading && ( // Show stop button only when actively loading
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" onClick={stop} className="shrink-0 text-muted-foreground hover:text-foreground">
                                    <ReloadIcon className="h-4 w-4 animate-spin" />
                                    <span className="sr-only">Stop generation</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs bg-popover text-popover-foreground border border-border shadow-md">Stop generation</TooltipContent>
                        </Tooltip>
                    )}
                    {/* Optional: Reload button - less common in this flow, but could be added */}
                    {/* <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" onClick={()=> reload()} disabled={isLoading || !messages.length} className="shrink-0 text-muted-foreground hover:text-foreground"><UpdateIcon className="h-4 w-4" /><span className="sr-only">Reload last</span></Button></TooltipTrigger><TooltipContent>Reload last AI response</TooltipContent></Tooltip> */}
                </form>
            </div>
        </TooltipProvider>
    );
}