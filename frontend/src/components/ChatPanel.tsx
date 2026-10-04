import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { io } from 'socket.io-client';

import { API_ORIGIN } from '../services/apiOrigin';
import {
  createDirectConversation,
  createGroupConversation,
  deleteChatMessage,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  searchChatUsers,
  sendChatMessage,
  updateChatMessage,
} from '../services/chat';
import type { ChatConversation, ChatMessage, ChatUser } from '../services/chat';
import './ChatPanel.css';

type Props = { accessToken: string; currentUserId: string };

const conversationTitle = (conversation: ChatConversation) =>
  conversation.type === 'GROUP'
    ? conversation.name ?? 'Group conversation'
    : conversation.otherUsername ? `@${conversation.otherUsername}` : 'Conversation';

export function ChatPanel({ accessToken, currentUserId }: Props) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ChatUser[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [typingName, setTypingName] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showMobileConversationList, setShowMobileConversationList] = useState(true);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const selectedIdRef = useRef(selectedId);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const priorScrollHeightRef = useRef<number | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refreshConversations = useCallback(async () => {
    const result = await fetchConversations(accessToken);
    setConversations(result);
    return result;
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    const socket = io(API_ORIGIN, {
      auth: { accessToken },
      path: '/socket.io',
    });
    socketRef.current = socket;

    socket.on('chat:presence_snapshot', (ids: unknown) => {
      if (Array.isArray(ids)) {
        setOnlineUsers(new Set(ids.filter((id): id is string => typeof id === 'string')));
      }
    });
    socket.on('chat:presence', (presence: { userId: string; online: boolean }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        if (presence.online) next.add(presence.userId);
        else next.delete(presence.userId);
        return next;
      });
    });
    socket.on('chat:conversation_available', () => {
      void refreshConversations().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not refresh conversations.');
      });
    });
    socket.on('chat:message', (message: ChatMessage) => {
      if (message.conversationId === selectedIdRef.current) {
        setMessages((current) => current.some((item) => item.id === message.id)
          ? current
          : [...current, message]);
        if (message.senderId !== currentUserId) {
          void markConversationRead(accessToken, message.conversationId).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'Could not update read status.');
          });
        }
      }
      void refreshConversations().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not refresh conversations.');
      });
    });
    socket.on('chat:message_updated', (message: ChatMessage) => {
      setMessages((current) => current.map((item) => item.id === message.id ? message : item));
      void refreshConversations().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not refresh conversations.');
      });
    });
    socket.on('chat:read', (receipt: { conversationId: string; userId: string; lastReadAt: string }) => {
      if (receipt.userId !== currentUserId && receipt.conversationId === selectedIdRef.current) {
        const readAt = Date.parse(receipt.lastReadAt);
        setMessages((current) => current.map((message) => (
          message.senderId === currentUserId && Date.parse(message.createdAt) <= readAt
            ? { ...message, isRead: true }
            : message
        )));
      }
    });
    socket.on('chat:typing', (event: {
      conversationId: string;
      userId: string;
      username: string;
      typing: boolean;
    }) => {
      if (event.conversationId === selectedIdRef.current && event.userId !== currentUserId) {
        setTypingName(event.typing ? `@${event.username}` : '');
      }
    });
    socket.on('connect_error', (reason: Error) => {
      if (active) setError(`Chat connection failed: ${reason.message}`);
    });

    void fetchConversations(accessToken)
      .then((result) => {
        if (active) {
          setConversations(result);
          if (result.length) setSelectedId((current) => current || result[0]!.id);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load conversations.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      socket.disconnect();
      socketRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [accessToken, currentUserId, refreshConversations]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void Promise.all([
      fetchMessages(accessToken, selectedId),
      markConversationRead(accessToken, selectedId),
    ]).then(([result]) => {
      if (active) setMessages(result);
      return refreshConversations();
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load messages.');
    });
    return () => {
      active = false;
    };
  }, [accessToken, refreshConversations, selectedId]);

  useEffect(() => {
    const list = messageListRef.current;
    if (priorScrollHeightRef.current !== null && list) {
      list.scrollTop += list.scrollHeight - priorScrollHeightRef.current;
      priorScrollHeightRef.current = null;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const value = search.trim();
    if (value.length < 2) {
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void searchChatUsers(accessToken, value)
        .then((results) => {
          if (active) {
            setSearchResults(results);
            setHasSearched(true);
          }
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : 'User search failed.');
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [accessToken, search]);

  const openDirectConversation = async (user: ChatUser) => {
    setError('');
    try {
      const conversation = await createDirectConversation(accessToken, user.id);
      await refreshConversations();
      setMessages([]);
      setTypingName('');
      setSelectedId(conversation.id);
      setShowMobileConversationList(false);
      setSearch('');
      setSearchResults([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start conversation.');
    }
  };

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      const conversation = await createGroupConversation(accessToken, groupName.trim(), groupMemberIds);
      await refreshConversations();
      setMessages([]);
      setTypingName('');
      setSelectedId(conversation.id);
      setShowMobileConversationList(false);
      setGroupName('');
      setGroupMemberIds([]);
      setSearch('');
      setSearchResults([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create group.');
    }
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !messageText.trim()) return;
    setIsSending(true);
    setError('');
    try {
      if (editing) {
        const updated = await updateChatMessage(accessToken, editing, messageText.trim());
        setMessages((current) => current.map((item) => item.id === updated.id ? updated : item));
        setEditing(null);
      } else {
        const created = await sendChatMessage(accessToken, selectedId, messageText.trim(), replyTo?.id ?? null);
        setMessages((current) => current.some((item) => item.id === created.id)
          ? current
          : [...current, created]);
        setReplyTo(null);
      }
      setMessageText('');
      socketRef.current?.emit('chat:typing_stop', selectedId);
      await refreshConversations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send message.');
    } finally {
      setIsSending(false);
    }
  };

  const beginTyping = (value: string) => {
    setMessageText(value);
    if (!selectedId || !socketRef.current?.connected) return;
    socketRef.current.emit('chat:typing_start', selectedId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('chat:typing_stop', selectedId);
    }, 1200);
  };

  const removeMessage = async (message: ChatMessage) => {
    if (!window.confirm('Delete this message for everyone in the conversation?')) return;
    setError('');
    try {
      const updated = await deleteChatMessage(accessToken, message);
      setMessages((current) => current.map((item) => item.id === updated.id ? updated : item));
      await refreshConversations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete message.');
    }
  };

  const loadOlderMessages = async () => {
    const oldest = messages[0];
    if (!selectedId || !oldest) return;
    try {
      const older = await fetchMessages(accessToken, selectedId, oldest.id);
      priorScrollHeightRef.current = messageListRef.current?.scrollHeight ?? null;
      setMessages((current) => [...older.filter((item) => !current.some((existing) => existing.id === item.id)), ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load older messages.');
    }
  };

  const selectedConversation = conversations.find((item) => item.id === selectedId);
  const directConversations = conversations.filter((conversation) => conversation.type === 'DIRECT');
  const groupConversations = conversations.filter((conversation) => conversation.type === 'GROUP');

  const renderConversation = (conversation: ChatConversation) => (
    <button
      type="button"
      key={conversation.id}
      className={`chat-conversation ${selectedId === conversation.id ? 'selected' : ''}`}
      onClick={() => {
        if (conversation.id !== selectedId) {
          setMessages([]);
          setTypingName('');
        }
        setSelectedId(conversation.id);
        setShowMobileConversationList(false);
      }}
      aria-current={selectedId === conversation.id ? 'true' : undefined}
    >
      <span className="chat-avatar" aria-hidden="true">
        {conversationTitle(conversation).slice(0, 1).toUpperCase()}
      </span>
      <span className="chat-conversation-copy">
        <strong>{conversationTitle(conversation)}</strong>
        <small>{conversation.lastMessage ?? 'Start the conversation'}</small>
      </span>
      {conversation.type === 'DIRECT' && conversation.otherUserId && onlineUsers.has(conversation.otherUserId) && (
        <span className="online-dot" aria-label="Online" />
      )}
      {conversation.unreadCount > 0 && (
        <span className="chat-unread" aria-label={`${conversation.unreadCount} unread messages`}>
          {conversation.unreadCount}
        </span>
      )}
    </button>
  );

  return (
    <section className="chat-panel panel" aria-label="Chat">
      <div className="panel-header">
        <div>
          <p className="eyebrow accent">Direct messages & community groups</p>
          <h3>Chat</h3>
        </div>
        <span className="pill neutral">{conversations.length} conversations</span>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className={`chat-layout ${showMobileConversationList ? '' : 'mobile-thread-open'}`}>
        <aside className="chat-sidebar" aria-label="Conversations">
          <div className="chat-mode-labels">
            <span>Direct messages</span>
            <span>Community groups</span>
          </div>
          <label className="chat-search">
            <span>Start a direct message by username</span>
            <input
              value={search}
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                setHasSearched(false);
                if (value.trim().length < 2) setSearchResults([]);
              }}
              placeholder="@username"
              aria-label="Search people"
            />
          </label>
          {searchResults.length > 0 && (
            <div className="chat-search-results">
              {searchResults.map((user) => (
                <div className="chat-user-result" key={user.id}>
                  <strong>@{user.username}</strong>
                  <div className="chat-user-actions">
                    <button type="button" className="inline-button" onClick={() => void openDirectConversation(user)}>
                      Direct message
                    </button>
                    <label title={`Add @${user.username} to group`}>
                      <input
                        type="checkbox"
                        checked={groupMemberIds.includes(user.id)}
                        onChange={(event) => setGroupMemberIds((current) => (
                          event.target.checked
                            ? [...current, user.id]
                            : current.filter((id) => id !== user.id)
                        ))}
                      />
                      Add to group
                    </label>
                  </div>
                </div>
              ))}
              {groupMemberIds.length > 0 && (
                <form className="chat-group-form" onSubmit={(event) => void createGroup(event)}>
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Community group name"
                    aria-label="Community group name"
                    required
                    maxLength={120}
                  />
                  <button type="submit" className="inline-button">Create community group</button>
                </form>
              )}
              {search.trim().length >= 2 && hasSearched && searchResults.length === 0 && (
                <p className="empty-state">No active account matches that username.</p>
              )}
            </div>
          )}
          <div className="chat-conversation-list">
            {isLoading ? <p className="empty-state">Loading conversations…</p> : null}
            {!isLoading && conversations.length === 0 ? (
              <p className="empty-state">Search by username to message someone or start a community group.</p>
            ) : null}
            {directConversations.length > 0 && (
              <>
                <h4>Direct</h4>
                {directConversations.map(renderConversation)}
              </>
            )}
            {groupConversations.length > 0 && (
              <>
                <h4>Community</h4>
                {groupConversations.map(renderConversation)}
              </>
            )}
          </div>
        </aside>

        <div className="chat-thread">
          <header className="chat-thread-header">
            <button
              type="button"
              className="chat-mobile-back"
              onClick={() => setShowMobileConversationList(true)}
            >
              Conversations
            </button>
            <div>
              <strong>{selectedConversation ? conversationTitle(selectedConversation) : 'Select a conversation'}</strong>
              {selectedConversation?.type === 'GROUP' && (
                <small>{selectedConversation.members.length} members</small>
              )}
              {selectedConversation?.type === 'DIRECT' && selectedConversation.otherUserId && (
                <small>{onlineUsers.has(selectedConversation.otherUserId) ? 'Online' : 'Offline'}</small>
              )}
            </div>
            {selectedId && messages.length > 0 && (
              <button type="button" className="inline-button" onClick={() => void loadOlderMessages()}>
                Load older
              </button>
            )}
          </header>

          <div className="chat-message-list" aria-live="polite" ref={messageListRef}>
            {messages.map((message) => {
              const own = message.senderId === currentUserId;
              return (
                <article className={`chat-message ${own ? 'own' : ''}`} key={message.id}>
                  {!own && <small className="chat-message-sender">@{message.senderUsername}</small>}
                  {message.replyToId && (
                    <small className="chat-reply-context">
                      Replying to: {message.replyToBody ?? 'message unavailable'}
                    </small>
                  )}
                  <p>{message.deletedAt ? 'This message was deleted' : message.body}</p>
                  <footer>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </time>
                    {message.editedAt && !message.deletedAt && <span>edited</span>}
                    {own && !message.deletedAt && <span>{message.isRead ? 'Seen' : 'Sent'}</span>}
                  </footer>
                  {!message.deletedAt && (
                    <div className="chat-message-actions">
                      <button type="button" onClick={() => {
                        setReplyTo(message);
                        setEditing(null);
                        setMessageText('');
                      }}>Reply</button>
                      {own && (
                        <>
                          <button type="button" onClick={() => {
                            setEditing(message);
                            setReplyTo(null);
                            setMessageText(message.body ?? '');
                          }}>Edit</button>
                          <button type="button" onClick={() => void removeMessage(message)}>Delete</button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {typingName && <p className="chat-typing" aria-live="polite">{typingName} is typing…</p>}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-compose" onSubmit={(event) => void submitMessage(event)}>
            {(replyTo || editing) && (
              <div className="chat-compose-context">
                <span>{editing ? 'Editing message' : `Replying to @${replyTo?.senderUsername}`}</span>
                <button type="button" onClick={() => {
                  setReplyTo(null);
                  setEditing(null);
                  setMessageText('');
                }}>Cancel</button>
              </div>
            )}
            <textarea
              value={messageText}
              onChange={(event) => beginTyping(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={selectedId ? 'Write a message…' : 'Choose or start a conversation'}
              aria-label="Message (Enter to send, Shift+Enter for a new line)"
              maxLength={4000}
              rows={2}
              disabled={!selectedId}
            />
            <button type="submit" className="primary-button" disabled={!selectedId || !messageText.trim() || isSending}>
              {isSending ? 'Sending…' : editing ? 'Save edit' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
