
export function getFaunaError(error) {

  const { code, description } = error.requestResult.responseContent.errors[0];
  let status;

  switch (code) {
    case 'unauthorized':
    case 'authentication failed':
      status = 401;
      break;
    case 'permission denied':
      status = 403;
      break;
    case 'instance not found':
      status = 404;
      break;
    case 'instance not unique':
    case 'contended transaction':
      status = 409;
      break;
    default:
      status = 500;
  }

  return { code, description, status };
}

export function removeDuplicatesListOfStrings(input) {
  var unique = [];
  input.forEach(element => {
    if (!unique.includes(element)) {
      unique.push(element);
    }
  });
  return unique;
}

export function removeDuplicatesListOfObjects(input) {
  const map = {};
  const newArray = [];
  input.forEach(el => {
    if (!map[JSON.stringify(el)]) {
      map[JSON.stringify(el)] = true;
      newArray.push(el);
    }
  })
  return newArray
}
