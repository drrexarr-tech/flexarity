import { useEffect, useState, useRef } from 'react';
import { MessageSquare, Plus, Search, Send, Trash2, Mic, Square, Play, Pause } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

function VoiceRecorder({ onSend }: { onSend: (audioBase64: string) => void }) {
  const [recording, setRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    chunks.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          onSend(base64);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Нет доступа к микрофону');
    }
  }

  function stop() {
    mediaRecorder.current?.stop();
    setRecording(false);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={recording ? 'text-destructive animate-pulse' : ''}
      onClick={recording ? stop : start}
    >
      {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}

function AudioMessage({ base64 }: { base64: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(`data:audio/webm;base64,${base64}`);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  return (
    <button onClick={toggle} className="flex items-center gap-2 text-sm hover:opacity-80">
      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      <span className="text-xs">Голосовое</span>
    </button>
  );
}

export function ChatsPage() {
  const user = useAuthStore((s) => s.user);
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [participantQuery, setParticipantQuery] = useState('');
  const [participantResults, setParticipantResults] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadChats() {
    try {
      const data = await api.chat.getAll();
      setChats(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadChats(); }, []);

  useEffect(() => {
    if (selectedChat) {
      const interval = setInterval(() => loadMessages(selectedChat.id), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedChat]);

  async function loadMessages(chatId: string) {
    try {
      const data = await api.chat.getMessages(chatId);
      setMessages(data);
    } catch {}
  }

  function selectChat(chat: any) {
    setSelectedChat(chat);
    loadMessages(chat.id);
  }

  async function handleSend(audioBase64?: string) {
    const text = audioBase64 ? '🎤 Голосовое сообщение' : newMessage.trim();
    if (!text && !audioBase64 || !selectedChat) return;
    try {
      const msg = await api.chat.sendMessage(selectedChat.id, text, audioBase64);
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
      loadChats();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeleteChat(chatId: string) {
    if (!confirm('Удалить чат?')) return;
    try {
      await api.chat.delete(chatId);
      if (selectedChat?.id === chatId) setSelectedChat(null);
      loadChats();
      toast.success('Чат удалён');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await api.chat.searchUsers(q);
      setSearchResults(data);
    } catch {}
  }

  async function handleParticipantSearch(q: string) {
    setParticipantQuery(q);
    if (q.length < 2) { setParticipantResults([]); return; }
    try {
      const data = await api.chat.searchParticipants(q);
      setParticipantResults(data);
    } catch {}
  }

  async function handleStartChat(participantId: string) {
    try {
      const chat = await api.chat.create(participantId);
      loadChats();
      setSearchQuery('');
      setSearchResults([]);
      selectChat(chat);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function navigateToChat(chatId: string) {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) selectChat(chat);
  }

  function getOtherUser(chat: any) {
    return chat.participants?.find((p: any) => p.user.id !== user?.id)?.user;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      <div className="flex w-72 shrink-0 flex-col rounded-xl border bg-card lg:w-80">
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Чаты</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8"><Plus className="h-4 w-4" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Новый чат</DialogTitle></DialogHeader>
                <Input placeholder="Поиск по имени или email..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} />
                <div className="mt-2 space-y-1">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                      onClick={() => handleStartChat(u.id)}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {u.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </button>
                  ))}
                  {searchQuery.length >= 2 && searchResults.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">Ничего не найдено</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск в чатах..."
              className="pl-8 h-8 text-sm"
              value={participantQuery}
              onChange={(e) => handleParticipantSearch(e.target.value)}
            />
          </div>
          {participantResults.length > 0 && (
            <div className="rounded-lg border bg-card p-1">
              {participantResults.map((u) => (
                <button
                  key={u.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => { navigateToChat(u.chatId); setParticipantQuery(''); setParticipantResults([]); }}
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <ScrollArea className="flex-1">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <MessageSquare className="mb-2 h-8 w-8" />
              <p className="text-sm">Нет чатов</p>
            </div>
          ) : (
            chats.map((chat) => {
              const other = getOtherUser(chat);
              return (
                <div key={chat.id} className="group flex">
                  <button
                    className={`flex flex-1 items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50 ${selectedChat?.id === chat.id ? 'bg-muted' : ''}`}
                    onClick={() => selectChat(chat)}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {other?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{other?.name || 'Чат'}</p>
                      <p className="truncate text-xs text-muted-foreground">{other?.email || ''}</p>
                      {chat.messages?.[0] && (
                        <p className="truncate text-xs text-muted-foreground/60">{chat.messages[0].content}</p>
                      )}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="invisible group-hover:visible h-9 w-9 shrink-0 self-center text-destructive"
                    onClick={() => handleDeleteChat(chat.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col rounded-xl border bg-card">
        {selectedChat ? (
          <>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {getOtherUser(selectedChat)?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-medium">{getOtherUser(selectedChat)?.name || 'Чат'}</p>
                  <p className="text-xs text-muted-foreground">{getOtherUser(selectedChat)?.email || ''}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteChat(selectedChat.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.userId === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      msg.userId === user?.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      {msg.audio ? (
                        <AudioMessage base64={msg.audio} />
                      ) : (
                        <p>{msg.content}</p>
                      )}
                      <p className={`mt-0.5 text-[10px] ${msg.userId === user?.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {msg.user.name}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2 border-t p-3">
              <VoiceRecorder onSend={(audio) => handleSend(audio)} />
              <Input
                placeholder="Сообщение..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              />
              <Button size="icon" onClick={() => handleSend()}><Send className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <MessageSquare className="mb-2 h-12 w-12" />
            <p className="text-lg">Выберите чат</p>
            <p className="text-sm">Или начните новый</p>
          </div>
        )}
      </div>
    </div>
  );
}
