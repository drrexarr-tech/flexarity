import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, Plus, Search, Send, Trash2, Mic, Square, Play, Pause, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
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
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onSend((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Нет доступа к микрофону');
    }
  }

  function stop() { mediaRecorder.current?.stop(); setRecording(false); }

  return (
    <Button variant="ghost" size="icon" className={cn('h-8 w-8 shrink-0', recording && 'text-destructive animate-pulse')} onClick={recording ? stop : start}>
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
    if (playing) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    else audioRef.current.play();
    setPlaying(!playing);
  }
  return (
    <button onClick={toggle} className="flex items-center gap-1.5 text-xs hover:opacity-80">
      {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      <span>Голосовое</span>
    </button>
  );
}

export function ChatsPage() {
  const { chatId: urlChatId } = useParams();
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
  const [showMobileList, setShowMobileList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (selectedChat) { const i = setInterval(() => loadMessages(selectedChat.id), 5000); return () => clearInterval(i); } }, [selectedChat?.id]);

  async function loadChats() {
    try { setChats(await api.chat.getAll()); } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { loadChats(); }, []);

  useEffect(() => {
    if (urlChatId && chats.length > 0) {
      const chat = chats.find((c) => c.id === urlChatId);
      if (chat) selectChat(chat);
    }
  }, [urlChatId, chats]);

  async function loadMessages(chatId: string) {
    try { setMessages(await api.chat.getMessages(chatId)); } catch {}
  }

  function selectChat(chat: any) {
    setSelectedChat(chat);
    loadMessages(chat.id);
    setShowMobileList(false);
  }

  async function handleSend(audioBase64?: string) {
    const text = audioBase64 ? '🎤 Голосовое сообщение' : newMessage.trim();
    if (!text && !audioBase64 || !selectedChat) return;
    try {
      const msg = await api.chat.sendMessage(selectedChat.id, text, audioBase64);
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
      loadChats();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDeleteChat(chatId: string) {
    if (!confirm('Удалить чат?')) return;
    try {
      await api.chat.delete(chatId);
      if (selectedChat?.id === chatId) setSelectedChat(null);
      loadChats();
      toast.success('Чат удалён');
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try { setSearchResults(await api.chat.searchUsers(q)); } catch {}
  }

  async function handleParticipantSearch(q: string) {
    setParticipantQuery(q);
    if (q.length < 2) { setParticipantResults([]); return; }
    try { setParticipantResults(await api.chat.searchParticipants(q)); } catch {}
  }

  async function handleStartChat(participantId: string) {
    try { const chat = await api.chat.create(participantId); loadChats(); setSearchQuery(''); setSearchResults([]); selectChat(chat); } catch (err: any) { toast.error(err.message); }
  }

  function getOtherUser(chat: any) { return chat.participants?.find((p: any) => p.user.id !== user?.id)?.user; }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="flex h-[calc(100vh-5rem)] -mx-4 -mt-4 lg:-mx-6 lg:-mt-6 overflow-hidden bg-background">
      {/* Chat list */}
      <div className={cn('w-72 shrink-0 flex-col border-r bg-card lg:flex', showMobileList ? 'flex' : 'hidden lg:flex')}>
        <div className="border-b px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Чаты</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="h-3.5 w-3.5" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Новый чат</DialogTitle></DialogHeader>
                <Input placeholder="Поиск по имени или email..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} />
                <div className="mt-2 space-y-0.5">
                  {searchResults.map((u) => (
                    <button key={u.id} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted" onClick={() => handleStartChat(u.id)}>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">{u.name?.[0]?.toUpperCase() || '?'}</div>
                      <div><p className="text-sm font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div>
                    </button>
                  ))}
                  {searchQuery.length >= 2 && searchResults.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Ничего не найдено</p>}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Поиск в чатах..." className="pl-7 h-7 text-xs" value={participantQuery} onChange={(e) => handleParticipantSearch(e.target.value)} />
          </div>
          {participantResults.length > 0 && (
            <div className="absolute z-10 w-64 rounded-md border bg-card shadow-md p-1">
              {participantResults.map((u) => (
                <button key={u.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => { const chat = chats.find((c) => c.id === u.chatId); if (chat) selectChat(chat); setParticipantQuery(''); setParticipantResults([]); }}>
                  <span className="font-medium">{u.name}</span>
                  <span className="text-muted-foreground">{u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <ScrollArea className="flex-1">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <MessageSquare className="mb-2 h-8 w-8" />
              <p className="text-xs">Нет чатов</p>
            </div>
          ) : (
            chats.map((chat) => {
              const other = getOtherUser(chat);
              return (
                <div key={chat.id} className="group flex items-center">
                  <button className={cn('flex flex-1 items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50 border-b border-border/50', selectedChat?.id === chat.id && 'bg-muted')} onClick={() => selectChat(chat)}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{other?.name?.[0]?.toUpperCase() || '?'}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{other?.name || 'Чат'}</p>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{other?.email || ''}</p>
                      {chat.messages?.[0] && <p className="truncate text-[11px] text-muted-foreground/60">{chat.messages[0].content}</p>}
                    </div>
                  </button>
                  <Button variant="ghost" size="icon" className="invisible group-hover:visible h-8 w-8 shrink-0 mr-1 text-destructive" onClick={() => handleDeleteChat(chat.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* Chat view */}
      <div className={cn('flex flex-1 flex-col', !showMobileList ? 'flex' : 'hidden lg:flex')}>
        {selectedChat ? (
          <>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={() => setShowMobileList(true)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{getOtherUser(selectedChat)?.name?.[0]?.toUpperCase() || '?'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getOtherUser(selectedChat)?.name || 'Чат'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{getOtherUser(selectedChat)?.email || ''}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => handleDeleteChat(selectedChat.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-1.5">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn('flex', msg.userId === user?.id ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[80%] px-3 py-1.5 text-sm leading-relaxed', msg.userId === user?.id ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md' : 'bg-muted rounded-2xl rounded-bl-md')}>
                      {msg.audio ? <AudioMessage base64={msg.audio} /> : <p>{msg.content}</p>}
                      <p className={cn('text-[10px] mt-0.5 opacity-60', msg.userId === user?.id ? 'text-right' : 'text-left')}>{msg.user.name}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="flex items-end gap-1.5 border-t p-2">
              <VoiceRecorder onSend={(audio) => handleSend(audio)} />
              <Input placeholder="Сообщение..." className="min-h-0 h-9 text-sm" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => handleSend()}><Send className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <MessageSquare className="mb-2 h-10 w-10" />
            <p className="text-sm">Выберите чат</p>
          </div>
        )}
      </div>
    </div>
  );
}
