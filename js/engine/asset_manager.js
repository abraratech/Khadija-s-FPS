class AssetManager {
    constructor() {
        this.models = new Map();
        this.textures = new Map();
        this.audio = new Map();
    }

    addModel(name, model) {
        this.models.set(name, model);
    }

    getModel(name) {
        return this.models.get(name);
    }

    hasModel(name) {
        return this.models.has(name);
    }

    clear() {
        this.models.clear();
        this.textures.clear();
        this.audio.clear();
    }

    stats() {
        return {
            models: this.models.size,
            textures: this.textures.size,
            audio: this.audio.size
        };
    }
}

window.assetManager = new AssetManager();