import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Recipe } from '@/types';
import toast from 'react-hot-toast';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  category: z.string().optional(),
  cookingTime: z.coerce.number().optional(),
  ingredients: z.string().optional(),
  instructions: z.string().optional(),
});

interface Props {
  recipe?: Recipe | null;
  onSuccess: () => void;
}

export function RecipeForm({ recipe, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const isEdit = !!recipe;

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: recipe
      ? {
          title: recipe.title,
          description: recipe.description || '',
          category: recipe.category || '',
          cookingTime: recipe.cookingTime || undefined,
          ingredients: recipe.ingredients ? JSON.parse(recipe.ingredients).join('\n') : '',
          instructions: recipe.instructions ? JSON.parse(recipe.instructions).join('\n') : '',
        }
      : {
          title: '',
          description: '',
          category: '',
          cookingTime: undefined,
          ingredients: '',
          instructions: '',
        },
  });

  async function onSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const payload = {
        ...data,
        ingredients: JSON.stringify(data.ingredients?.split('\n').filter(Boolean) || []),
        instructions: JSON.stringify(data.instructions?.split('\n').filter(Boolean) || []),
      };

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
        <Label htmlFor="description">Описание</Label>
        <Textarea id="description" rows={3} {...form.register('description')} />
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

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать рецепт'}
      </Button>
    </form>
  );
}
