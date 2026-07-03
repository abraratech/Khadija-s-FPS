class ActorManager {
    constructor() {
        this.actors = [];
    }

    register(actor) {
        if (!actor) return;

        // Prevent duplicate registration
        if (!this.actors.includes(actor)) {
            this.actors.push(actor);
        }
    }

    unregister(actor) {
        const i = this.actors.indexOf(actor);
        if (i !== -1) {
            this.actors.splice(i, 1);
        }
    }

    clear() {
        this.actors.length = 0;
    }

    getAll() {
        return this.actors;
    }

    count() {
        return this.actors.length;
    }
}

window.actorManager = new ActorManager();