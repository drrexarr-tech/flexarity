import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { ALL_SECTIONS, MAX_VISIBLE, useNavStore, type SectionId } from '@/stores/navStore';
import { cn } from '@/lib/utils';

/**
 * Picks what the bottom bar shows and in what order.
 *
 * Every section stays in the list whether or not it is currently in the bar.
 * The first version split them into "in the bar" and "hidden" and switching one
 * off made the row vanish outright, which reads as the app deleting something:
 * you flick a switch and the item disappears from under your finger, with the
 * only way back buried in a row of chips further down. A muted row that stays
 * where it was says "not in the bar" without pretending anything was lost.
 *
 * Reordering uses buttons rather than drag and drop. On a phone, dragging is
 * unreliable, has no keyboard equivalent, and fights the browser's own scroll
 * gestures; two arrows and a visible order are unambiguous.
 */
interface BottomNavSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BottomNavSettings({ open, onOpenChange }: BottomNavSettingsProps) {
  const order = useNavStore((s) => s.order);
  const toggle = useNavStore((s) => s.toggle);
  const move = useNavStore((s) => s.move);
  const reset = useNavStore((s) => s.reset);

  const isOn = (id: SectionId) => order.includes(id);
  // Position within the bar, not within the full list, so the number shown is
  // the order the user will actually see on the phone.
  const positionOf = (id: SectionId) => order.indexOf(id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Меню внизу</DialogTitle>
          <DialogDescription>
            Выберите разделы для нижнего меню и их порядок. До {MAX_VISIBLE} разделов, порядок
            сверху вниз.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {ALL_SECTIONS.map((section) => {
            const id = section.id as SectionId;
            const on = isOn(id);
            const at = positionOf(id);
            const full = !on && order.length >= MAX_VISIBLE;

            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                  on ? 'bg-muted/30' : 'bg-transparent border-dashed opacity-70'
                )}
              >
                <span className="w-5 shrink-0 text-center text-sm text-muted-foreground">
                  {on ? at + 1 : '—'}
                </span>

                <span className={cn('min-w-0 flex-1 truncate text-sm', on ? 'font-medium' : 'text-muted-foreground')}>
                  {section.label}
                </span>

                {on ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Переместить «${section.label}» выше`}
                      disabled={at === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Переместить «${section.label}» ниже`}
                      disabled={at === order.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <span className="w-16 text-right text-xs text-muted-foreground">в меню</span>
                )}

                <Switch
                  checked={on}
                  disabled={full}
                  onCheckedChange={() => toggle(id)}
                  aria-label={`${on ? 'Убрать' : 'Добавить'} «${section.label}» ${on ? 'из' : 'в'} меню`}
                />
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Выбрано {order.length} из {MAX_VISIBLE}. Остальные разделы доступны в боковом меню.
        </p>

        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="ghost" onClick={reset} className="text-muted-foreground">
            <RotateCcw className="mr-2 h-4 w-4" />
            Сбросить
          </Button>
          <Button onClick={() => onOpenChange(false)}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}