import * as THREE from 'three';

export class SimplePointCloudLoader {
  private geometry: THREE.BufferGeometry | null = null;
  private loadingProgress: number = 0;
  private totalPoints: number = 0;
  private processedPoints: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.geometry = null;
    this.loadingProgress = 0;
    this.totalPoints = 0;
    this.processedPoints = 0;
  }

  async loadFromText(text: string, onProgress?: (progress: number) => void): Promise<void> {
    this.reset();

    const lines = text.trim().split('\n');
    this.totalPoints = lines.length;

    const positions: number[] = [];
    const colors: number[] = [];

    const chunkSize = 100000;
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkEnd = Math.min(i + chunkSize, lines.length);
      const chunk = lines.slice(i, chunkEnd);

      for (const line of chunk) {
        const [x, y, z, r, g, b] = line.trim().split(/\s+/).map(Number);
        positions.push(x, z, -y); // OBS! Y/Z-wrapping för korrekt orientering
        colors.push(r / 255, g / 255, b / 255);
        this.processedPoints++;
      }

      this.loadingProgress = (this.processedPoints / this.totalPoints) * 100;
      if (onProgress) onProgress(this.loadingProgress);

      await new Promise(resolve => setTimeout(resolve, 0)); // låt UI uppdatera
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }

  getGeometry(): THREE.BufferGeometry | null {
    return this.geometry;
  }

  getLoadingProgress(): number {
    return this.loadingProgress;
  }

  isLoading(): boolean {
    return this.processedPoints < this.totalPoints;
  }
}
