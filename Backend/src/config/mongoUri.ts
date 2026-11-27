/**
 * Diagnóstico de MONGO_URI sin revelar la contraseña. Se escribe en el log cuando falla la conexión,
 * para encontrar errores típicos de copiado (símbolos sin codificar, `<` `>` sobrantes, usuario mal escrito).
 * Devuelve el usuario y el servidor (no son secretos), pero de la contraseña solo cuántos caracteres tiene.
 */
export interface MongoUriReport {
  scheme: string | null;
  username: string | null;
  usernameLength: number;
  passwordLength: number;
  host: string | null;
  database: string | null;
  problems: string[];
}

const UNENCODED_PASSWORD_CHARS = /[@:/?#[\]]/;

export const describeMongoUri = (uri: string | undefined): MongoUriReport => {
  const report: MongoUriReport = {
    scheme: null,
    username: null,
    usernameLength: 0,
    passwordLength: 0,
    host: null,
    database: null,
    problems: [],
  };
  const value = uri ?? '';
  if (!value.trim()) {
    report.problems.push('MONGO_URI está vacía');
    return report;
  }

  const scheme = /^(mongodb(?:\+srv)?):\/\//.exec(value);
  if (!scheme) {
    report.problems.push('no empieza por mongodb:// ni mongodb+srv://');
    return report;
  }
  report.scheme = scheme[1];

  if (/\s/.test(value)) report.problems.push('contiene espacios o saltos de línea (revisa el principio y el final)');
  if (/[<>]/.test(value)) report.problems.push('quedan los símbolos < o > (hay que quitarlos y dejar solo el valor real)');

  const rest = value.slice(scheme[0].length);
  const atCount = (rest.split('?')[0].match(/@/g) ?? []).length;
  if (atCount === 0) {
    report.problems.push('no tiene usuario y contraseña (falta la parte usuario:contraseña@)');
  } else if (atCount > 1) {
    report.problems.push('hay más de un @: lo más probable es que la contraseña tenga un @ (usa una solo con letras y números)');
  }

  const at = rest.lastIndexOf('@');
  const credentials = at >= 0 ? rest.slice(0, at) : '';
  const afterAt = at >= 0 ? rest.slice(at + 1) : rest;

  if (credentials) {
    const colon = credentials.indexOf(':');
    if (colon < 0) {
      report.problems.push('falta el : entre el usuario y la contraseña');
      report.username = credentials;
      report.usernameLength = credentials.length;
    } else {
      const username = credentials.slice(0, colon);
      const password = credentials.slice(colon + 1);
      report.username = username;
      report.usernameLength = username.length;
      report.passwordLength = password.length;
      if (!username) report.problems.push('el usuario está vacío');
      if (!password) report.problems.push('la contraseña está vacía');
      if (UNENCODED_PASSWORD_CHARS.test(password)) {
        report.problems.push('la contraseña tiene símbolos (@ : / ? # [ ]) que rompen la dirección: usa una solo con letras y números');
      }
      if (/^<.*>$/.test(password) || password === 'db_password') {
        report.problems.push('la contraseña es el marcador sin reemplazar');
      }
    }
  }

  const hostEnd = afterAt.search(/[/?]/);
  report.host = hostEnd >= 0 ? afterAt.slice(0, hostEnd) : afterAt;
  const pathAndQuery = hostEnd >= 0 ? afterAt.slice(hostEnd) : '';
  const database = pathAndQuery.startsWith('/') ? pathAndQuery.slice(1).split('?')[0] : '';
  report.database = database || null;
  if (!report.database) report.problems.push('no indica el nombre de la base de datos (falta /nombre antes del ?)');

  return report;
};
