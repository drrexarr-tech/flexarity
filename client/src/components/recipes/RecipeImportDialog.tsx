import { useState } from 'react';
import { Link2, Loader2, Wand2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import type { RecipePrefill } from '@/components/recipes/RecipeForm';
import toast from 'react-hot-toast';

interface Parsed {
  title: string;
  ingredients: string[];
  instructions: string[];
  cookingTime?: number;
  image?: string | null;
  source: 'json-ld' | 'microdata' | 'heuristic';
  charset: string;
  charsetGuessed: boolean;
}

const SOURCE_LABEL: Record<Parsed['source'], string> = {
  'json-ld': 'schema.org',
  microdata: 'микроразметка',
  heuristic: 'эвристика',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (data: RecipePrefill) => void;
}

export function RecipeImportDialog({ open, onOpenChange, onImported }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Parsed | null>(null);

  function reset() {
    setUrl('');
    setResult(null);
    setLoading(false);
  }

  async function handleParse() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      // A bare host is a common paste; assume https rather than rejecting it.
      const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const parsed = await api.recipes.import(candidate);
      setResult(parsed);
      // Keep the normalised form so the link stored on the recipe is usable.
      setUrl(candidate);
      if (!parsed.ingredients.length && !parsed.instructions.length) {
        toast.error('На странице не нашлось ни ингредиентов, ни шагов');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    onImported({
      title: result.title || '',
      url: url.trim(),
      ingredients: result.ingredients,
      instructions: result.instructions,
      cookingTime: result.cookingTime ?? null,
      imageUrl: result.image ?? null,
    });
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Импорт рецепта</DialogTitle>
          <DialogDescription>
            Вставьте ссылку — заполним ингредиенты и шаги автоматически
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="import-url">Ссылка на рецепт</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="import-url"
                  className="pl-8"
                  placeholder="https://..."
                  value={url}
                  disabled={loading}
                  onChange={(e) => { setUrl(e.target.value); setResult(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleParse();
                    }
                  }}
                />
              </div>
              <Button onClick={handleParse} disabled={loading || !url.trim()}>
                {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                Распознать
              </Button>
            </div>
          </div>

          {result && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {result.title && <span className="text-sm font-medium">{result.title}</span>}
                <Badge variant="secondary" className="text-[10px]">
                  {SOURCE_LABEL[result.source]}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {result.charset}
                  {result.charsetGuessed ? ' (угадана)' : ''}
                </Badge>
              </div>

              {result.image && (
                <img
                  src={result.image}
                  alt=""
                  className="h-32 w-full rounded-md object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Ингредиентов: {result.ingredients.length}</span>
                <span>Шагов: {result.instructions.length}</span>
                {result.cookingTime ? <span>Время: {result.cookingTime} мин</span> : null}
              </div>

              {result.ingredients.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium">Ингредиенты</p>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {result.ingredients.map((item, i) => (
                      <li key={i}>· {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.instructions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium">Шаги</p>
                  <ol className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {result.instructions.map((step, i) => (
                      <li key={i}>{i + 1}. {step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {!result.ingredients.length && !result.instructions.length && (
                <p className="text-xs text-destructive">
                  Ничего не удалось извлечь. Можно заполнить форму вручную.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Закрыть</Button>
          <Button onClick={handleApply} disabled={!result}>
            <Check className="mr-1 h-4 w-4" /> Подставить в форму
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}