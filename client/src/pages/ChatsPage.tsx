import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, Plus, Search, Send, Trash2, Mic, Square, Play, Pause, ChevronLeft, CheckCheck, Lock, UnlockKeyhole } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatTime } from '@/lib/utils';
import {
  getStoredPrivateKey, storePrivateKey, generateKeyPair,
  generateAESKey, encryptAESKey, decryptAESKey,
  encryptMessage, decryptMessage, encryptAudio, decryptAudio,
} from '@/lib/crypto';
import toast from 'react-hot-toast';

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VoiceRecorder({ onSend }: { onSend: (audioBase64: string, duration: number) => void }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startTime = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval>>();

  async function start() {
    chunks.current = [];
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        const duration = Math.floor((Date.now() - startTime.current) / 1000);
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onSend((reader.result as string).split(',')[1], duration);
        reader.readAsDataURL(blob);
      };
      startTime.current = Date.now();
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 200);
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Нет доступа к микрофону');
    }
  }

  function stop() { mediaRecorder.current?.stop(); setRecording(false); }

  useEffect(() => () => { clearInterval(timer.current); }, []);

  return (
    <div className="flex items-center gap-1">
      {recording && <span className="text-[11px] text-destructive font-mono tabular-nums animate-pulse">{formatDuration(elapsed)}</span>}
      <Button variant="ghost" size="icon" className={cn('h-8 w-8 shrink-0', recording && 'text-destructive')} onClick={recording ? stop : start}>
        {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function AudioMessage({ base64, duration }: { base64: string; duration?: number }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(`data:audio/webm;base64,${base64}`);
      audioRef.current.onended = () => { setPlaying(false); setCurrentTime(0); };
      audioRef.current.ontimeupdate = () => setCurrentTime(Math.floor(audioRef.current!.currentTime));
    }
    if (playing) { audioRef.current.pause(); }
    else audioRef.current.play();
    setPlaying(!playing);
  }

  return (
    <button onClick={toggle} className="flex items-center gap-2 text-xs hover:opacity-80 min-w-[100px]">
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      <div className="flex-1 h-1.5 bg-muted-foreground/20 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
      </div>
      <span className="tabular-nums text-muted-foreground w-10 text-right">{duration ? formatDuration(playing ? currentTime : duration) : ''}</span>
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
  const [encryptionReady, setEncryptionReady] = useState(false);
  const aesKeyRef = useRef<CryptoKey | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function initEncryption() {
    let privKey = getStoredPrivateKey();
    if (!privKey || !localStorage.getItem('flex_pubkey')) {
      const pair = await generateKeyPair();
      storePrivateKey(pair.privateKey);
      localStorage.setItem('flex_pubkey', JSON.stringify(pair.publicKey));
      await api.auth.setPublicKey(JSON.stringify(pair.publicKey));
    } else if (!localStorage.getItem('flex_pubkey_sent')) {
      try {
        await api.auth.setPublicKey(localStorage.getItem('flex_pubkey')!);
      } catch {}
      localStorage.setItem('flex_pubkey_sent', '1');
    }
    setEncryptionReady(true);
  }

  useEffect(() => { initEncryption(); }, []);

  async function ensureAESKey(chat: any) {
    if (aesKeyRef.current) return aesKeyRef.current;
    const privKey = getStoredPrivateKey();
    if (!privKey) return null;
    const encryptedKey = chat.keys?.[0]?.key;
    if (!encryptedKey) return null;
    const key = await decryptAESKey(encryptedKey, privKey);
    aesKeyRef.current = key;
    return key;
  }

  async function loadChats() {
    try { setChats(await api.chat.getAll()); }
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
    const msgs = await api.chat.getMessages(chatId);
    const key = aesKeyRef.current;
    if (key) {
      const decrypted = await Promise.all(msgs.map(async (m: any) => {
        try {
          if (m.content && !m.content.startsWith('🎤')) {
            m.content = await decryptMessage(m.content, key);
          }
          if (m.audio) {
            m.audio = await decryptAudio(m.audio, key);
          }
        } catch {}
        return m;
      }));
      setMessages(decrypted);
    } else {
      setMessages(msgs);
    }
  }

  async function selectChat(chat: any) {
    setSelectedChat(chat);
    aesKeyRef.current = null;
    await ensureAESKey(chat);
    loadMessages(chat.id);
    setShowMobileList(false);
  }

  async function handleSend(audioBase64?: string, audioDuration?: number) {
    const text = audioBase64 ? '🎤' : newMessage.trim();
    if (!text && !audioBase64 || !selectedChat) return;
    try {
      const key = aesKeyRef.current;
      let encryptedContent = text;
      let encryptedAudio = audioBase64;
      if (key) {
        if (!audioBase64 && text) encryptedContent = await encryptMessage(text, key);
        if (audioBase64 && encryptedAudio) encryptedAudio = await encryptAudio(audioBase64, key);
      }
      const msg = await api.chat.sendMessage(selectedChat.id, encryptedContent, encryptedAudio, audioDuration);
      if (key) {
        try {
          if (msg.content && !msg.content.startsWith('🎤')) msg.content = await decryptMessage(msg.content, key);
          if (msg.audio) msg.audio = await decryptAudio(msg.audio, key);
        } catch {}
      }
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
    try {
      const ownPub = localStorage.getItem('flex_pubkey');
      let encryptedKeys: Record<string, string> | undefined;

      if (ownPub) {
        const theirKey = await api.auth.getPublicKey(participantId);
        if (theirKey.publicKey) {
          const aesKey = await generateAESKey();
          const myEncrypted = await encryptAESKey(aesKey, JSON.parse(ownPub));
          const theirEncrypted = await encryptAESKey(aesKey, JSON.parse(theirKey.publicKey));
          encryptedKeys = { [user!.id]: myEncrypted, [participantId]: theirEncrypted };
          aesKeyRef.current = aesKey;
        }
      }

      const chat = await api.chat.create(participantId, encryptedKeys);
      loadChats();
      setSearchQuery('');
      setSearchResults([]);
      selectChat(chat);
    } catch (err: any) { toast.error(err.message); }
  }

  function getOtherUser(chat: any) { return chat.participants?.find((p: any) => p.user.id !== user?.id)?.user; }

  if (!encryptionReady || loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="flex h-[calc(100vh-5rem)] -mx-4 -mt-4 lg:-mx-6 lg:-mt-6 overflow-hidden bg-background">
      {/* Chat list */}
      <div className={cn('w-full lg:w-72 shrink-0 flex-col border-r bg-card lg:flex', showMobileList ? 'flex' : 'hidden lg:flex')}>
        <div className="border-b px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Чаты</h2>
              {aesKeyRef.current && <Lock className="h-3 w-3 text-green-500" />}
            </div>
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
              const hasKey = chat.keys?.length > 0;
              return (
                <div key={chat.id} className="group flex items-center">
                  <button className={cn('flex flex-1 items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50 border-b border-border/50', selectedChat?.id === chat.id && 'bg-muted')} onClick={() => selectChat(chat)}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{other?.name?.[0]?.toUpperCase() || '?'}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{other?.name || 'Чат'}</p>
                        {hasKey && <Lock className="h-3 w-3 shrink-0 text-green-500" />}
                        {!hasKey && <UnlockKeyhole className="h-3 w-3 shrink-0 text-muted-foreground/40" />}
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
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{getOtherUser(selectedChat)?.name || 'Чат'}</p>
                  {aesKeyRef.current ? <Lock className="h-3 w-3 text-green-500" /> : <UnlockKeyhole className="h-3 w-3 text-muted-foreground/50" />}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{getOtherUser(selectedChat)?.email || ''}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => handleDeleteChat(selectedChat.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-4 py-3">
                {messages.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">Сообщений пока нет</p>}
                {messages.map((msg, i) => {
                  const isMine = msg.userId === user?.id;
                  const showName = !isMine && (i === 0 || messages[i - 1]?.userId !== msg.userId);
                  return (
                    <div key={msg.id} className="flex flex-col items-start mb-1 max-w-[80%]">
                      {showName && <p className="text-[11px] text-primary font-medium mb-0.5 ml-1">{msg.user.name}</p>}
                      <div className={cn('px-3 py-1.5 text-sm leading-relaxed bg-muted rounded-2xl rounded-bl-md', msg.content === '🎤' && !msg.audio && 'opacity-60')}>
                        {msg.audio ? (
                          <AudioMessage base64={msg.audio} duration={msg.audioDuration} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 ml-1">
                        <span className="text-[10px] text-muted-foreground/50">{formatTime(msg.createdAt)}</span>
                        {isMine && msg.readAt && (
                          <span className="flex items-center gap-0.5 text-[10px] text-primary/60">
                            <CheckCheck className="h-3 w-3" /> Прочитано
                          </span>
                        )}
                        {aesKeyRef.current && (
                          <Lock className="h-2.5 w-2.5 text-green-500/40" />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="flex items-end gap-1.5 border-t p-2">
              <VoiceRecorder onSend={(audio, duration) => handleSend(audio, duration)} />
              <Input placeholder="Сообщение..." className="min-h-0 h-9 text-sm" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => handleSend()}><Send className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            {aesKeyRef.current ? <Lock className="mb-2 h-10 w-10 text-green-500/50" /> : <UnlockKeyhole className="mb-2 h-10 w-10" />}
            <p className="text-sm">Выберите чат</p>
            <p className="text-xs text-muted-foreground/60">{aesKeyRef.current ? 'Сквозное шифрование активно' : 'Нет шифрования'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
