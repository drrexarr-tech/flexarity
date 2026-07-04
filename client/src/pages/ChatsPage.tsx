import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, Search, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function ChatsPage() {
  const user = useAuthStore((s) => s.user);
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const navigate = useNavigate();

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

  async function loadMessages(chatId: string) {
    try {
      const data = await api.chat.getMessages(chatId);
      setMessages(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function selectChat(chat: any) {
    setSelectedChat(chat);
    loadMessages(chat.id);
  }

  async function handleSend() {
    if (!newMessage.trim() || !selectedChat) return;
    try {
      const msg = await api.chat.sendMessage(selectedChat.id, newMessage.trim());
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
      loadChats();
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

  function getOtherUserName(chat: any) {
    return chat.participants?.find((p: any) => p.user.id !== user?.id)?.user?.name || 'Чат';
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
        <div className="flex items-center justify-between border-b px-4 py-3">
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
        <ScrollArea className="flex-1">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <MessageSquare className="mb-2 h-8 w-8" />
              <p className="text-sm">Нет чатов</p>
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50 ${selectedChat?.id === chat.id ? 'bg-muted' : ''}`}
                onClick={() => selectChat(chat)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {getOtherUserName(chat)?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{getOtherUserName(chat)}</p>
                  {chat.messages?.[0] && (
                    <p className="truncate text-xs text-muted-foreground">{chat.messages[0].content}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col rounded-xl border bg-card">
        {selectedChat ? (
          <>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {getOtherUserName(selectedChat)?.[0]?.toUpperCase() || '?'}
              </div>
              <p className="font-medium">{getOtherUserName(selectedChat)}</p>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.userId === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      msg.userId === user?.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`mt-0.5 text-[10px] ${msg.userId === user?.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {msg.user.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2 border-t p-3">
              <Input
                placeholder="Сообщение..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              />
              <Button size="icon" onClick={handleSend}><Send className="h-4 w-4" /></Button>
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
