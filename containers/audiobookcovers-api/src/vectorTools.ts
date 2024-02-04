// Generate a random vector
function generateRandomVector(size: number): number[] {
  let vector = [];
  for (let i = 0; i < size; i++) {
    vector.push(Math.random() * 2 - 1);
  }
  return vector;
}

// Calculate the magnitude of a vector
function vectorMagnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0));
}

// Normalize a vector to a unit vector
function normalizeVector(vector: number[]): number[] {
  const magnitude = vectorMagnitude(vector);
  return vector.map((element) => element / magnitude);
}

// Generate random unit vector
export function generateRandomUnitVector(size: number): number[] {
  return normalizeVector(generateRandomVector(size));
}
