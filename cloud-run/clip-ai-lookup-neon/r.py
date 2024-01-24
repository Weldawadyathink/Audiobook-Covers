import numpy as np


v = np.random.normal(size=512).tolist()

l = [str(i) for i in v]

print(", ".join(l))