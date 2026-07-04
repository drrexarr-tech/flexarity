import { useEffect, useState, useRef } from 'react';
import { Plus, Mic, Square, Play, Pause, Trash2, Edit3, StickyNote } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import toast from 'react-hot-toast';

function VoiceRecorder({ onSend }: { onSend: (audioBase64: string) => void }) {
  const [recording, setRecording] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  async function start() {
    chunks.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mr.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (ev) => onSend((ev.target!.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setRecording(true);
    } catch { toast.error('Нет доступа к микрофону'); }
  }
  function stop() { mr.current?.stop(); setRecording(false); }
  return (
    <Button variant="ghost" size="icon" className={`shrink-0 ${recording ? 'text-destructive animate-pulse' : ''}`} onClick={recording ? stop : start}>
      {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}

function AudioMsg({ base64 }: { base64: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  function toggle() {
    if (!ref.current) { ref.current = new Audio(`data:audio/webm;base64,${base64}`); ref.current.onended = () => setPlaying(false); }
    if (playing) { ref.current.pause(); ref.current.currentTime = 0; } else ref.current.play();
    setPlaying(!playing);
  }
  return (
    <button onClick={toggle} className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80">
      {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      <span>Голосовая заметка</span>
    </button>
  );
}

export function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audio, setAudio] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setNotes(await api.notes.getAll()); } catch {}
    finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setTitle(''); setContent(''); setAudio(null); setDialogOpen(true); }

  function openEdit(note: any) { setEditing(note); setTitle(note.title); setContent(note.content || ''); setAudio(note.audio || null); setDialogOpen(true); }

  async function handleSave() {
    if (!title.trim()) return;
    try {
      const data: any = { title, content };
      if (audio) data.audio = audio;
      if (editing) {
        await api.notes.update(editing.id, data);
      } else {
        await api.notes.create(data);
      }
      setDialogOpen(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить заметку?')) return;
    try { await api.notes.delete(id); load(); toast.success('Заметка удалена'); } catch (err: any) { toast.error(err.message); }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold lg:text-3xl">Заметки</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Создать</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Редактировать' : 'Новая заметка'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Содержание..." rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="flex items-center gap-2">
              <VoiceRecorder onSend={(b) => setAudio(b)} />
              {audio && <AudioMsg base64={audio} />}
              {audio && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setAudio(null)}><Trash2 className="h-3 w-3" /></Button>}
            </div>
            <Button className="w-full" onClick={handleSave}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <StickyNote className="mb-3 h-10 w-10" />
          <p className="text-sm">Нет заметок</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {notes.map((note) => (
            <Card key={note.id} className="group cursor-pointer transition-shadow hover:shadow-md" onClick={() => openEdit(note)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium truncate">{note.title}</h3>
                  <Button variant="ghost" size="icon" className="invisible group-hover:visible h-7 w-7 shrink-0 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {note.content && <p className="mt-1 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{note.content}</p>}
                {note.audio && <div className="mt-2"><AudioMsg base64={note.audio} /></div>}
                <p className="mt-2 text-[10px] text-muted-foreground/60">{new Date(note.updatedAt).toLocaleDateString('ru-RU')}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
