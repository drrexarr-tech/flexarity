import { useEffect, useState, useRef } from 'react';
import { Plus, Mic, Square, Play, Pause, Trash2, Edit3, StickyNote, Image, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import toast from 'react-hot-toast';

function VoiceRecorder({ onSend }: { onSend: (audioBase64: string, duration: number) => void }) {
  const [recording, setRecording] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startTime = useRef(0);
  async function start() {
    chunks.current = [];
    startTime.current = Date.now();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mr.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = Math.round((Date.now() - startTime.current) / 1000);
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (ev) => onSend((ev.target!.result as string).split(',')[1], duration);
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

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AudioMsg({ base64, duration }: { base64: string; duration?: number }) {
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
      <span>{duration != null ? formatDuration(duration) : 'Голосовая заметка'}</span>
    </button>
  );
}

function NoteImages({ imagesJson }: { imagesJson: string | null }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const images = (() => { try { const p = JSON.parse(imagesJson || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })();
  if (images.length === 0) return null;
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((img: string, i: number) => (
          <img key={i} src={`data:image/png;base64,${img}`} alt="" className="h-16 w-16 rounded-md object-cover border cursor-pointer" loading="lazy" onClick={() => setLightbox(img)} />
        ))}
      </div>
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh]">
          {lightbox && <img src={`data:image/png;base64,${lightbox}`} alt="" className="w-full h-auto max-h-[80vh] object-contain rounded-md" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audios, setAudios] = useState<{ data: string; duration: number }[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setNotes(await api.notes.getAll()); } catch {}
    finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setTitle(''); setContent(''); setAudios([]); setImages([]); setSaving(false); setDialogOpen(true); }

  function openEdit(note: any) {
    setEditing(note);
    setTitle(note.title);
    setContent(note.content || '');
    try {
      const parsed = JSON.parse(note.audio || '[]');
      if (Array.isArray(parsed)) {
        setAudios(parsed.map((a: any) => typeof a === 'string' ? { data: a, duration: 0 } : a));
      } else {
        setAudios(note.audio ? [{ data: note.audio, duration: 0 }] : []);
      }
    } catch { setAudios(note.audio ? [{ data: note.audio, duration: 0 }] : []); }
    try { setImages(JSON.parse(note.images || '[]')); } catch { setImages([]); }
    setSaving(false);
    setDialogOpen(true);
  }

  function addAudio(audioBase64: string, duration: number) { setAudios((prev) => [...prev, { data: audioBase64, duration }]); }

  function removeAudio(idx: number) { setAudios((prev) => prev.filter((_, i) => i !== idx)); }

  function addImage(imgBase64: string) { setImages((prev) => [...prev, imgBase64]); }

  function removeImage(idx: number) { setImages((prev) => prev.filter((_, i) => i !== idx)); }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target!.result as string).split(',')[1];
      addImage(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const data: any = { title, content };
      if (audios.length > 0) data.audio = JSON.stringify(audios);
      else data.audio = null;
      if (images.length > 0) data.images = JSON.stringify(images);
      else data.images = null;
      if (editing) {
        await api.notes.update(editing.id, data);
      } else {
        await api.notes.create(data);
      }
      setDialogOpen(false);
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await api.notes.delete(id); setDeleteTarget(null); load(); toast.success('Заметка удалена'); } catch (err: any) { toast.error(err.message); }
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
            <div className="flex flex-wrap items-center gap-2">
              <VoiceRecorder onSend={addAudio} />
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} title="Добавить изображение">
                <Image className="h-4 w-4" />
              </Button>
              {images.map((img, i) => (
                <div key={i} className="relative group/image">
                  <img src={`data:image/png;base64,${img}`} alt="" className="h-10 w-10 rounded-md object-cover border" />
                  <button className="absolute -top-1 -right-1 hidden group-hover/image:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground" onClick={() => removeImage(i)}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {audios.map((a, i) => (
                <div key={i} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                  <AudioMsg base64={a.data} duration={a.duration} />
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => removeAudio(i)}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить заметку?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Отмена</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>Удалить</Button>
          </DialogFooter>
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
                  <Button variant="ghost" size="icon" className="invisible group-hover:visible h-7 w-7 shrink-0 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(note.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {note.content && <p className="mt-1 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{note.content}</p>}
                <NoteImages imagesJson={note.images} />
                {note.audio && (() => { try {
                  const list = JSON.parse(note.audio);
                  if (Array.isArray(list)) {
                    return list.map((a: any, i: number) => {
                      const base64 = typeof a === 'string' ? a : a.data;
                      const duration = typeof a === 'object' ? a.duration : undefined;
                      return <div key={i} className="mt-1"><AudioMsg base64={base64} duration={duration} /></div>;
                    });
                  }
                  return <div className="mt-2"><AudioMsg base64={note.audio} /></div>;
                } catch { return <div className="mt-2"><AudioMsg base64={note.audio} /></div>; }})()}
                <p className="mt-2 text-[10px] text-muted-foreground/60">{new Date(note.updatedAt).toLocaleDateString('ru-RU')}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
