# Demo della TUI cleverOps (banner gradient + selezione interattiva).
# Registra solo banner + primo menu + un po' di navigazione, poi Ctrl+C:
# NON raggiunge la conferma, quindi non installa nulla.
# Rigenera con:  vhs extras/demo/cleverops.tape   (da root repo)

Output extras/demo/cleverops.gif

Set Shell bash
Set FontSize 16
Set Width 1000
Set Height 720
Set Padding 22
Set TypingSpeed 55ms

Sleep 500ms
Type "npx github:Cleversoft-IT/cleverOps-public"
Enter
Sleep 7s

Type "drupal"
Sleep 1200ms
Down
Sleep 350ms
Space
Sleep 500ms
Down
Sleep 350ms
Space
Sleep 1300ms

Ctrl+C
Sleep 1200ms
