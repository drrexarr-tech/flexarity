import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Recipe } from '@/types';
import toast from 'react-hot-toast';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  url: z.string().optional(),
  category: z.string().optional(),
  cookingTime: z.coerce.number().optional(),
  ingredients: z.string().optional(),
  instructions: z.string().optional(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
});

interface Props {
  recipe?: Recipe | null;
  onSuccess: () => void;
}

export function RecipeForm({ recipe, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [families, setFamilies] = useState<any[]>([]);
  const isEdit = !!recipe;

  useEffect(() => {
    api.family.getAll().then(setFamilies).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: recipe
      ? {
          title: recipe.title,
          url: recipe.url || '',
          category: recipe.category || '',
          cookingTime: recipe.cookingTime || undefined,
          ingredients: recipe.ingredients ? JSON.parse(recipe.ingredients).join('\n') : '',
          instructions: recipe.instructions ? JSON.parse(recipe.instructions).join('\n') : '',
          visibility: recipe.visibility || 'private',
          familyId: recipe.familyId || undefined,
        }
      : {
          title: '',
          url: '',
          category: '',
          cookingTime: undefined,
          ingredients: '',
          instructions: '',
          visibility: 'private',
          familyId: undefined,
        },
  });

  const visibility = form.watch('visibility');

  async function onSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const payload: any = {
        ...data,
        ingredients: JSON.stringify(data.ingredients?.split('\n').filter(Boolean) || []),
        instructions: JSON.stringify(data.instructions?.split('\n').filter(Boolean) || []),
      };
      if (data.visibility !== 'family') delete payload.familyId;

      if (isEdit && recipe) {
        await api.recipes.update(recipe.id, payload);
        toast.success('Рецепт обновлён');
      } else {
        await api.recipes.create(payload);
        toast.success('Рецепт создан');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Название</Label>
        <Input id="title" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="recipe-url">Ссылка на рецепт</Label>
        <Input id="recipe-url" placeholder="https://..." {...form.register('url')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Категория</Label>
          <Input id="category" placeholder="Например: Десерты" {...form.register('category')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cookingTime">Время готовки (мин)</Label>
          <Input id="cookingTime" type="number" {...form.register('cookingTime')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ingredients">Ингредиенты (каждый с новой строки)</Label>
        <Textarea id="ingredients" rows={5} {...form.register('ingredients')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Инструкции (каждый шаг с новой строки)</Label>
        <Textarea id="instructions" rows={5} {...form.register('instructions')} />
      </div>

      <div className="space-y-2">
        <Label>Видимость</Label>
        <Select
          value={form.watch('visibility')}
          onValueChange={(v) => form.setValue('visibility', v as any)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Только я</SelectItem>
            <SelectItem value="family">Семья</SelectItem>
            <SelectItem value="public">Публичный</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visibility === 'family' && families.length > 0 && (
        <div className="space-y-2">
          <Label>Выберите семью</Label>
          <Select
            value={form.watch('familyId') || ''}
            onValueChange={(v) => form.setValue('familyId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите семью" />
            </SelectTrigger>
            <SelectContent>
              {families.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать рецепт'}
      </Button>
    </form>
  );
}
