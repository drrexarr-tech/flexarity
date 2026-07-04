export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  ingredients: string;
  instructions: string;
  cookingTime: number | null;
  category: string | null;
  imageUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskColumn {
  id: string;
  title: string;
  color: string | null;
  order: number;
  tasks: Task[];
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  dueDate: string | null;
  order: number;
  columnId: string;
  column?: TaskColumn;
}
