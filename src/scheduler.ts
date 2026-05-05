import { sleep, get_random_int } from './util';
import logger from './logger';

export interface Itask {
	id: string;
	name: string;
	nextRun: number; // timestamp in seconds
	priority?: number; // 0 = high priority (fire-and-forget, independent watcher), 1 = normal (default)
	run: () => Promise<number | null>; // returns next delay in seconds or null if finished
}

class SchedulerService {
	private tasks: Map<string, Itask> = new Map();
	private running_tasks: Set<string> = new Set(); // ids of fire-and-forget tasks currently in flight
	private isRunning: boolean = false;
	private minDelayBetweenTasks: number = 2; // minimum seconds between normal tasks
	private startup_until: number = 0;        // timestamp until which startup stagger is active
	private next_startup_slot: number = 0;    // next available slot for staggered startup tasks

	public schedule_task(task: Itask, withJitter: boolean = true): void {
		const now = Math.floor(Date.now() / 1000);
		const is_high_priority = (task.priority ?? 1) === 0;
		const is_new_task = !this.tasks.has(task.id);
		const is_startup = now < this.startup_until;

		if (withJitter && !is_high_priority) {
			task.nextRun += get_random_int(1, 10);
		}

		// stagger new normal tasks that would run immediately during the startup phase
		if (is_startup && is_new_task && !is_high_priority && task.nextRun <= now + 30) {
			const slot = Math.max(task.nextRun, this.next_startup_slot);
			task.nextRun = slot + get_random_int(15, 30);
			this.next_startup_slot = task.nextRun;
		}

		this.tasks.set(task.id, task);
		logger.debug(`task [${task.name}] scheduled for ${new Date(task.nextRun * 1000).toLocaleTimeString()}`, 'scheduler');
	}

	public remove_task(taskId: string): void {
		if (this.tasks.has(taskId)) {
			this.tasks.delete(taskId);
		}
	}

	private launch_fire_and_forget(task: Itask): void {
		this.running_tasks.add(task.id);
		logger.debug(`executing task [${task.name}]`, 'scheduler');

		task.run()
			.then(nextDelay => {
				this.running_tasks.delete(task.id);
				if (!this.tasks.has(task.id)) return;
				if (nextDelay !== null) {
					task.nextRun = Math.floor(Date.now() / 1000) + nextDelay;
					this.schedule_task(task, true);
				} else {
					this.tasks.delete(task.id);
					logger.info(`task [${task.name}] completed and removed`, 'scheduler');
				}
			})
			.catch((error: any) => {
				this.running_tasks.delete(task.id);
				logger.error(`error executing task [${task.name}]: ${error.message}`, 'scheduler');
				if (error.stack) logger.debug(error.stack, 'scheduler');
				if (!this.tasks.has(task.id)) return;
				task.nextRun = Math.floor(Date.now() / 1000) + 60;
				this.schedule_task(task, false);
			});
	}

	// runs concurrently with the main loop — launches priority-0 tasks independently
	// so they are never blocked by normal tasks (e.g. robber_hideouts human delays)
	private async run_high_priority_watcher(): Promise<void> {
		while (this.isRunning) {
			const now = Math.floor(Date.now() / 1000);
			const due = Array.from(this.tasks.values())
				.filter(t => (t.priority ?? 1) === 0 && t.nextRun <= now && !this.running_tasks.has(t.id));
			for (const task of due) {
				this.launch_fire_and_forget(task);
			}
			await sleep(0.1); // poll every 100ms
		}
	}

	public async start(): Promise<void> {
		if (this.isRunning) return;
		this.isRunning = true;
		this.startup_until = Math.floor(Date.now() / 1000) + 600; // 10-minute startup window
		this.next_startup_slot = Math.floor(Date.now() / 1000);
		logger.info('task scheduler started', 'scheduler');

		// high-priority watcher runs concurrently — not awaited
		this.run_high_priority_watcher();

		while (this.isRunning) {
			const now = Math.floor(Date.now() / 1000);

			// normal tasks only — priority-0 is handled exclusively by the watcher
			const dueTasks = Array.from(this.tasks.values())
				.filter(t => t.nextRun <= now && !this.running_tasks.has(t.id) && (t.priority ?? 1) > 0)
				.sort((a, b) => a.nextRun - b.nextRun);

			if (dueTasks.length > 0) {
				const task = dueTasks[0];

				try {
					logger.debug(`executing task [${task.name}]`, 'scheduler');
					const nextDelay = await task.run();

					if (!this.tasks.has(task.id)) {
						logger.debug(`task [${task.name}] was removed during execution, skipping return handling`, 'scheduler');
						continue;
					}

					if (nextDelay !== null) {
						task.nextRun = Math.floor(Date.now() / 1000) + nextDelay;
						this.schedule_task(task, true);
					} else {
						this.tasks.delete(task.id);
						logger.info(`task [${task.name}] completed and removed`, 'scheduler');
					}
				} catch (error: any) {
					logger.error(`error executing task [${task.name}]: ${error.message}`, 'scheduler');
					if (error.stack) {
						logger.debug(error.stack, 'scheduler');
					}

					// Retry after 1 minute on error
					task.nextRun = Math.floor(Date.now() / 1000) + 60;
					this.schedule_task(task, false);
				}

				await sleep(this.minDelayBetweenTasks);
			} else {
				// No tasks due, wait a bit
				await sleep(1);
			}
		}
	}

	public stop(): void {
		this.isRunning = false;
		logger.info('task scheduler stopped', 'scheduler');
	}
}

export default new SchedulerService();
