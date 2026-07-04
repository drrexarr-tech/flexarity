import { useNavigate } from 'react-router-dom';
import { BookOpen, CheckSquare, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const apps = [
  {
    title: 'Книга рецептов',
    description: 'Создавайте и храните свои кулинарные рецепты. Добавляйте ингредиенты, пошаговые инструкции и категории.',
    icon: BookOpen,
    path: '/recipes',
    color: 'from-orange-500 to-red-500',
  },
  {
    title: 'Планировщик задач',
    description: 'Управляйте задачами в виде списка или канбан-доски. Ставьте приоритеты и сроки.',
    icon: CheckSquare,
    path: '/tasks',
    color: 'from-blue-500 to-indigo-500',
  },
];

export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Главная</h1>
        <p className="text-sm text-muted-foreground lg:text-base">Выберите приложение для работы</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {apps.map((app) => (
          <Card
            key={app.path}
            className="group relative cursor-pointer overflow-hidden transition-shadow hover:shadow-lg active:scale-[0.98]"
            onClick={() => navigate(app.path)}
          >
            <div className={`absolute inset-0 opacity-5 bg-gradient-to-br ${app.color}`} />
            <CardHeader className="p-4 lg:p-6">
              <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${app.color} lg:h-12 lg:w-12`}>
                <app.icon className="h-5 w-5 text-white lg:h-6 lg:w-6" />
              </div>
              <CardTitle className="text-base lg:text-xl">{app.title}</CardTitle>
              <CardDescription className="text-xs lg:text-sm">{app.description}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 lg:p-6 lg:pt-0">
              <div className="flex items-center gap-1 text-sm font-medium text-primary">
                Открыть
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
