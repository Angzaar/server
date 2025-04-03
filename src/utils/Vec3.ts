export class Vec3 {
    constructor(public x: number, public y: number, public z: number) {}

    // Static method to create a new Vec3
    static create(x: number, y: number, z: number): Vec3 {
        return new Vec3(x, y, z);
    }

    // Add two vectors
    add(other: Vec3): Vec3 {
        return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
    }

    // Subtract two vectors
    subtract(other: Vec3): Vec3 {
        return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
    }

    // Multiply vector by scalar
    scale(scalar: number): Vec3 {
        return new Vec3(this.x * scalar, this.y * scalar, this.z * scalar);
    }

    // Compute dot product
    dot(other: Vec3): number {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }

    // Compute vector length (magnitude)
    length(): number {
        return Math.sqrt(this.dot(this));
    }

    // Normalize the vector (make its length 1)
    normalize(): Vec3 {
        const len = this.length();
        return len > 0 ? this.scale(1 / len) : new Vec3(0, 0, 0);
    }

    // Compute distance between two points
    static distance(a: Vec3, b: Vec3): number {
        return Math.sqrt(
            Math.pow(b.x - a.x, 2) +
            Math.pow(b.y - a.y, 2) +
            Math.pow(b.z - a.z, 2)
        );
    }
}
