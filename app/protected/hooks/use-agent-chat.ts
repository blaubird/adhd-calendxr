'use client';
import { useState } from 'react';
import { Draft } from 'app/types';

export function useAgentChat(anchor: string, rangeEnd: string) {
  const [pendingDrafts, setPendingDrafts] = useState<Draft[]>([]);
  const [clarifications, setClarifications] = useState<string[] | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    {
      role: 'assistant',
      content: 'Describe what to schedule (RU/EN). I will create drafts for you to confirm.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMessage = { role: 'user' as const, content: text };
    const history = [...chatMessages, userMessage];
    setChatMessages(history);
    setChatInput('');
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, range: { start: anchor, end: rangeEnd } }),
      });

      if (!res.ok) {
        setChatError('AI is unavailable right now. Please try again.');
        setChatMessages((msgs) => [
          ...msgs,
          { role: 'assistant', content: 'Sorry, I could not reach the planner AI right now.' },
        ]);
        return;
      }

      const data = await res.json();

      if (data.error) {
        setChatError('AI is unavailable right now. Please try again.');
        setChatMessages((msgs) => [
          ...msgs,
          { role: 'assistant', content: 'Sorry, I could not reach the planner AI right now.' },
        ]);
        return;
      }

      if (data.needClarification) {
        setClarifications(data.questions || []);
        setPendingDrafts([]);
        setChatMessages((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: `Need clarification:\n${(data.questions || []).join('\n')}`,
          },
        ]);
        return;
      }

      if (data.drafts && Array.isArray(data.drafts)) {
        if (data.drafts.length > 0) {
          setPendingDrafts(data.drafts);
          setClarifications(null);
          const reply = data.reply || `Created ${data.drafts.length} draft(s). Review and confirm below.`;
          setChatMessages((msgs) => [
            ...msgs,
            { role: 'assistant', content: reply },
          ]);
          return;
        }

        setClarifications(data.questions || []);
        setPendingDrafts([]);
        setChatMessages((msgs) => [
          ...msgs,
          { role: 'assistant', content: 'Need clarification to create drafts.' },
        ]);
        return;
      }

      setChatMessages((msgs) => [
        ...msgs,
        { role: 'assistant', content: 'I could not produce drafts from that input.' },
      ]);
    } catch (e) {
      setChatError('Could not reach the AI right now.');
      setChatMessages((msgs) => [
        ...msgs,
        { role: 'assistant', content: 'Something went wrong while talking to the AI.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return {
    pendingDrafts,
    setPendingDrafts,
    clarifications,
    chatMessages,
    chatInput,
    setChatInput,
    chatLoading,
    chatError,
    sendChatMessage,
  };
}
