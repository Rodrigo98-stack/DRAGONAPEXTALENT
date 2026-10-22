const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&*?';

/** Senha forte gerada com o gerador criptográfico do navegador (sempre com maiúscula, minúscula, número e símbolo). */
export function generatePassword(length = 16): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint32Array(length));
    const pwd = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[@#$%&*?]/.test(pwd)) return pwd;
  }
}
