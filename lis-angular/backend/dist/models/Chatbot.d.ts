export interface ChatMessage {
    id: string;
    conversation_id: string;
    user_id: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    sources?: string | null;
    created_at: string;
}
export interface ChatConversation {
    id: string;
    user_id: string | null;
    title: string;
    last_model: string;
    created_at: string;
    updated_at: string;
    messages?: ChatMessage[];
}
export declare const ChatbotModel: {
    findConversations(userId?: string): ChatConversation[];
    findConversationById(id: string): ChatConversation | null;
    createConversation(data: {
        user_id?: string | null;
        title?: string;
        last_model?: string;
    }): ChatConversation;
    addMessage(data: {
        conversation_id: string;
        user_id?: string | null;
        role: "user" | "assistant" | "system";
        content: string;
        sources?: string | null;
    }): ChatMessage;
    deleteConversation(id: string): boolean;
};
//# sourceMappingURL=Chatbot.d.ts.map