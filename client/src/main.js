import { createApp, h } from 'vue';

createApp({
  render: () => h('main', { class: 'schedule-assistant' }, [
    h('h1', 'AI Schedule Assistant'),
    h('p', 'Synthetic demonstration client. Scheduling data is managed by the server.')
  ])
}).mount('#app');
