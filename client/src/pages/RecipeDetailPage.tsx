import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Edit3, Trash2, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { RecipeForm } from '@/components/recipes/RecipeForm';
import type { Recipe } from '@/types';
import toast from 'react-hot-toast';

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const data = await api.recipes.getById(id);
      setRecipe(data);
    } catch (err: any) {
      toast.error(err.message);
      navigate('/recipes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleDelete() {
    if (!recipe) return;
    try {
      await api.recipes.delete(recipe.id);
      toast.success('Рецепт удалён');
      navigate('/recipes');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!recipe) return null;

  const ingredients = JSON.parse(recipe.ingredients || '[]');
  const instructions = JSON.parse(recipe.instructions || '[]');

  return (
    <div className="max-w-3xl space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/recipes')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад
        </Button>
        <div className="flex gap-2">
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                <Edit3 className="mr-2 h-4 w-4" /> Редактировать
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto sm:w-full">
              <DialogHeader>
                <DialogTitle>Редактировать рецепт</DialogTitle>
              </DialogHeader>
              <RecipeForm recipe={recipe} onSuccess={() => { setEditDialogOpen(false); load(); }} />
            </DialogContent>
          </Dialog>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialog(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Удалить
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold lg:text-3xl">{recipe.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {recipe.category && <Badge>{recipe.category}</Badge>}
              {recipe.visibility && (
                <Badge variant="outline">
                  {recipe.visibility === 'private' ? 'Только я' : recipe.visibility === 'family' ? 'Семья' : 'Публичный'}
                </Badge>
              )}
              {recipe.url && (
                <a href={recipe.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <ExternalLink className="h-4 w-4" /> Ссылка
                </a>
              )}
              {recipe.cookingTime && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" /> {recipe.cookingTime} минут
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader className="p-4 lg:p-6">
          <CardTitle className="text-lg lg:text-xl">Ингредиенты</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 lg:px-6 lg:pb-6">
          {ingredients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ингредиенты не указаны</p>
          ) : (
            <ul className="list-inside list-disc space-y-1">
              {ingredients.map((item: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground lg:text-base">{item}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 lg:p-6">
          <CardTitle className="text-lg lg:text-xl">Инструкция по приготовлению</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 lg:px-6 lg:pb-6">
          {instructions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Инструкции не добавлены</p>
          ) : (
            <ol className="space-y-4">
              {instructions.map((step: string, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-sm text-muted-foreground lg:text-base">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить рецепт?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Отмена</Button>
            <Button variant="destructive" onClick={() => { setDeleteDialog(false); handleDelete(); }}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
