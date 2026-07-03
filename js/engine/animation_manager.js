class AnimationManager {
    constructor() {
        this.frame = 0;
    }

    shouldUpdate(enemy, dt) {
        if (!enemy.mixer) return false;

        // Distance from player
        const dx = enemy.mesh.position.x - player.pos.x;
        const dz = enemy.mesh.position.z - player.pos.z;
        const distSq = dx * dx + dz * dz;

        // < 8m
        if (distSq < 64) {
            enemy.mixer.update(dt);
            return true;
        }

        // 8–18m
        if (distSq < 324) {
            if ((this.frame & 1) === 0) {
                enemy.mixer.update(dt * 2);
            }
            return true;
        }

        // 18–30m
        if (distSq < 900) {
            if ((this.frame & 3) === 0) {
                enemy.mixer.update(dt * 4);
            }
            return true;
        }

        // Beyond 30m
        return false;
    }

    endFrame() {
        this.frame++;
    }
}

window.animationManager = new AnimationManager();