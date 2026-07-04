import { useEffect, useState } from 'react';
import { Plus, Search, Clock, Trash2, Edit3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RecipeForm } from '@/components/recipes/RecipeForm';
import type { Recipe } from '@/types';
import toast from 'react-hot-toast';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = !useMediaQuery('(min-width: 640px)');

  async function load() {
    try {
      const data = await api.recipes.getAll();
      setRecipes(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Удалить рецепт?')) return;
    try {
      await api.recipes.delete(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      toast.success('Рецепт удалён');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const filtered = recipes.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Книга рецептов</h1>
          <p className="text-sm text-muted-foreground lg:text-base">Ваши кулинарные рецепты</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" size={isMobile ? 'default' : 'default'}>
              <Plus className="mr-2 h-4 w-4" /> Добавить рецепт
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto sm:w-full">
            <DialogHeader>
              <DialogTitle>{editing ? 'Редактировать рецепт' : 'Новый рецепт'}</DialogTitle>
            </DialogHeader>
            <RecipeForm
              recipe={editing}
              onSuccess={() => {
                setEditing(null);
                setDialogOpen(false);
                load();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Поиск рецептов..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-lg">Рецептов пока нет</p>
          <p className="text-sm">Добавьте первый рецепт</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((recipe) => (
            <Card
              key={recipe.id}
              className="group cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/recipes/${recipe.id}`)}
            >
              <CardHeader className="p-3 lg:p-4">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm lg:text-base">{recipe.title}</CardTitle>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(recipe);
                      }}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(recipe.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 lg:p-4 lg:pt-0">
                {recipe.description && (
                  <p className="mb-2 line-clamp-2 text-xs text-muted-foreground lg:text-sm">
                    {recipe.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {recipe.category && <Badge variant="secondary" className="text-[10px] lg:text-xs">{recipe.category}</Badge>}
                  {recipe.cookingTime && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground lg:text-xs">
                      <Clock className="h-3 w-3" /> {recipe.cookingTime} мин
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
