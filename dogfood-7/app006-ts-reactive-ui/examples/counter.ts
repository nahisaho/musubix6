import { signal, computed, batch } from '../packages/signals/src/index.ts';
import { createScheduler } from '../packages/scheduler/src/index.ts';
import { h } from '../packages/vdom/src/index.ts';
import { renderToString } from '../packages/ssr/src/index.ts';
import { mount, memoryHost } from '../packages/runtime/src/index.ts';

const count = signal(0), doubled = computed(() => count.get() * 2);
const view = () => h('section', { id: 'counter' },
  h('button', { onClick: () => count.set(count.get() + 1) }, `Count: ${count.get()}`),
  h('output', {}, `Double: ${doubled.get()}`));
const scheduler = createScheduler(), host = memoryHost();
console.log('SSR:', renderToString(view));
const app = mount(view, host, scheduler);
batch(() => { count.set(1); count.set(2); });
scheduler.flush();
console.log('Updated:', host.html());
host.root!.children[0].listeners.get('click')!();
scheduler.flush();
console.log('Clicked:', host.html());
app.dispose();
