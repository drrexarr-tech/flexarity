export interface User {
  id: string;
  email: string;
  name: string;
  telegramId?: string | null;
  vkId?: string | null;
  avatarUrl?: string | null;
  dateOfBirth?: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  url: string | null;
  ingredients: string;
  instructions: string;
  cookingTime: number | null;
  category: string | null;
  imageUrl: string | null;
  isPublic: boolean;
  visibility: 'private' | 'family' | 'public';
  familyId: string | null;
  createdAt: string;
  updatedAt: string;
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
  visibility: 'private' | 'family' | 'public';
  familyId: string | null;
  userId: string;
  user?: { id: string; name: string };
  assigneeId?: string | null;
  assignee?: { id: string; name: string; email: string } | null;
}

export interface TaskColumn {
  id: string;
  title: string;
  color: string | null;
  order: number;
  tasks: Task[];
}

export interface PlanEntry {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  note: string | null;
  date: string;
  createdAt: string;
  userId: string;
  user?: { id: string; name: string };
}

export interface Plan {
  id: string;
  title: string;
  description: string | null;
  targetAmount: number;
  deadline: string | null;
  color: string | null;
  visibility: 'private' | 'family' | 'public';
  familyId: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user?: { id: string; name: string };
  entries?: PlanEntry[];
  canEdit?: boolean;
  saved: number;
  income: number;
  expense: number;
  percent: number;
  remaining: number;
}

export interface WishItem {
  id: string;
  title: string;
  price: number | null;
  url: string | null;
  note: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  bought: boolean;
  boughtAt: string | null;
  createdAt: string;
  wishlistId: string;
  ownerId: string;
  owner?: { id: string; name: string };
  recipientId: string | null;
  recipient?: { id: string; name: string } | null;
}

export interface Wishlist {
  id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'family' | 'public';
  familyId: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user?: { id: string; name: string };
  items?: WishItem[];
  canEdit?: boolean;
  itemCount: number;
  boughtCount: number;
  totalPrice: number;
  unboughtTotal: number;
}
