"use client";

import React, { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";

type MessageProps = {
  role: "user" | "assistant" | "code";
  text: string;
};

const UserMessage = ({ text }: { text: string }) => {
  return (
    <div className="bg-black text-white ml-auto p-2 w-fit rounded-md">
      {text}
    </div>
  );
};

const AssistantMessage = ({ text }: { text: string }) => {
  return (
    <div className="bg-gray-300 p-2 w-fit rounded-md">
      <Markdown>{text}</Markdown>
    </div>
  );
};

const Message = ({ role, text }: MessageProps) => {
  switch (role) {
    case "user":
      return <UserMessage text={text} />;
    case "assistant":
      return <AssistantMessage text={text} />;
    default:
      return null;
  }
};

type ChatProps = {
  onReceiveAvailabilities: (availabilities) => void;
};

const Chat = ({ onReceiveAvailabilities }: ChatProps) => {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  useEffect(() => {
    const createConversation = async () => {
      const res = await fetch(`/api/assistants/threads`, {
        method: "POST",
      });
      const data = await res.json();
      setConversationId(data.conversationId);
    };
    createConversation();
  }, []);

  const sendMessage = async (text) => {
    const response = await fetch(
      `/api/assistants/threads/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: text,
        }),
      }
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantMessageCreated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        setInputDisabled(false);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          if (event.type === "response.output_text.delta") {
            if (!assistantMessageCreated) {
              setMessages((prevMessages) => [
                ...prevMessages,
                { role: "assistant", text: "" },
              ]);
              assistantMessageCreated = true;
            }
            setMessages((prevMessages) => {
              const lastMessage = prevMessages[prevMessages.length - 1];
              const updatedLastMessage = {
                ...lastMessage,
                text: lastMessage.text + event.delta,
              };
              return [...prevMessages.slice(0, -1), updatedLastMessage];
            });
          } else if (event.event === "search_availability") {
            onReceiveAvailabilities(event.data);
          }
        } catch (err) {
          console.log("err parse", line);
        }
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    sendMessage(userInput);
    setMessages((prevMessages) => [
      ...prevMessages,
      { role: "user", text: userInput },
    ]);
    setUserInput("");
    setInputDisabled(true);
    scrollToBottom();
  };

  return (
    <div className="h-screen flex flex-col p-6 gap-4 flex-1">
      <div className="flex flex-col gap-3 flex-1 p-4 border border-gray-400 rounded-md shadow-md overflow-y-auto">
        {messages.map((msg, index) => (
          <Message key={index} role={msg.role} text={msg.text} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-4 h-9">
        <input
          type="text"
          className="border border-gray-400 rounded-md flex-1 p-1 shadow-md"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Enter your question"
        />
        <button
          type="submit"
          className="bg-slate-800 text-white rounded-md w-16 disabled:bg-gray-400 shadow-md"
          disabled={inputDisabled}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
