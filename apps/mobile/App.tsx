import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator
} from 'react-native';

// When running on an Android Emulator, 10.0.2.2 maps to the host machine's localhost
// When running in an iOS Simulator, localhost works fine
const API_URL = Platform.OS === 'android'
    ? 'http://10.0.2.2:4141/v1/chat/completions'
    : 'http://localhost:4141/v1/chat/completions';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function App() {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Hello! I am LokaMobile, your local-first AI assistant powered by LokaFlow on your desktop network. How can I help?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content: input.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // In a real mobile app, you would handle SSE streaming or standard JSON
            // We do a standard JSON fetch here for simplicity of the scaffold
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    stream: false // Using non-streaming for the React Native scaffold for simplicity
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            const botReply = data.choices?.[0]?.message?.content || 'No response received.';

            setMessages(prev => [...prev, { role: 'assistant', content: botReply }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Connection error. Ensure 'lokaflow serve' is running on your desktop. (${String(error)})` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.header}>
                    <Text style={styles.headerText}>LokaMobile (V2.8)</Text>
                    <Text style={styles.statusText}>Connecting to Desktop Mesh</Text>
                </View>

                <ScrollView style={styles.chatArea} contentContainerStyle={styles.chatContent}>
                    {messages.map((msg, index) => (
                        <View
                            key={index}
                            style={[
                                styles.messageBubble,
                                msg.role === 'user' ? styles.messageUser : styles.messageAssistant
                            ]}
                        >
                            <Text
                                style={[
                                    styles.messageText,
                                    msg.role === 'user' ? styles.messageTextUser : styles.messageTextAssistant
                                ]}
                            >
                                {msg.content}
                            </Text>
                        </View>
                    ))}
                    {isLoading && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color="#10b981" />
                            <Text style={styles.loadingText}>Routing via LokaFlow...</Text>
                        </View>
                    )}
                </ScrollView>

                <View style={styles.inputArea}>
                    <TextInput
                        style={styles.input}
                        value={input}
                        onChangeText={setInput}
                        placeholder="Type a message..."
                        placeholderTextColor="#71717a"
                        onSubmitEditing={sendMessage}
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
                        onPress={sendMessage}
                        disabled={!input.trim() || isLoading}
                    >
                        <Text style={styles.sendButtonText}>Send</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#09090b',
    },
    header: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#27272a',
        alignItems: 'center',
    },
    headerText: {
        color: '#fafafa',
        fontSize: 18,
        fontWeight: 'bold',
    },
    statusText: {
        color: '#10b981',
        fontSize: 12,
        marginTop: 4,
    },
    chatArea: {
        flex: 1,
    },
    chatContent: {
        padding: 16,
        gap: 12,
    },
    messageBubble: {
        maxWidth: '85%',
        padding: 12,
        borderRadius: 16,
    },
    messageUser: {
        alignSelf: 'flex-end',
        backgroundColor: '#27272a',
        borderBottomRightRadius: 4,
    },
    messageAssistant: {
        alignSelf: 'flex-start',
        backgroundColor: '#064e3b',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 22,
    },
    messageTextUser: {
        color: '#fafafa',
    },
    messageTextAssistant: {
        color: '#ecfdf5',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        padding: 12,
        gap: 8,
    },
    loadingText: {
        color: '#a1a1aa',
        fontSize: 14,
    },
    inputArea: {
        flexDirection: 'row',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
        backgroundColor: '#18181b',
        alignItems: 'center',
        gap: 8,
    },
    input: {
        flex: 1,
        backgroundColor: '#27272a',
        color: '#fafafa',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 16,
        maxHeight: 100,
    },
    sendButton: {
        backgroundColor: '#10b981',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#064e3b',
        opacity: 0.5,
    },
    sendButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});
