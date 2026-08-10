export const cholesky = (matrix: readonly (readonly number[])[]) => {
  const size = matrix.length;
  if (!size || matrix.some((row) => row.length !== size)) throw new Error("Correlation matrix must be square");
  const lower = Array.from({ length: size }, () => Array<number>(size).fill(0));
  for (let row = 0; row < size; row += 1) {
    if (Math.abs(matrix[row][row] - 1) > 1e-12) throw new Error("Correlation diagonal must equal one");
    for (let column = 0; column < size; column += 1) {
      if (Math.abs(matrix[row][column] - matrix[column][row]) > 1e-12 || Math.abs(matrix[row][column]) > 1) {
        throw new Error("Correlation matrix must be symmetric with values in [-1,1]");
      }
    }
    for (let column = 0; column <= row; column += 1) {
      let pivot = matrix[row][column];
      for (let index = 0; index < column; index += 1) pivot -= lower[row][index] * lower[column][index];
      if (row === column) {
        if (pivot < -1e-12) throw new Error("Correlation matrix must be positive semidefinite");
        lower[row][column] = Math.sqrt(Math.max(0, pivot));
      } else if (lower[column][column] === 0) {
        if (Math.abs(pivot) > 1e-12) throw new Error("Correlation matrix must be positive semidefinite");
        lower[row][column] = 0;
      } else lower[row][column] = pivot / lower[column][column];
    }
  }
  return lower;
};
