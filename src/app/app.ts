
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageFlip, ALL_POINTERS } from '@gullabs/flipbook-core';

type Herramienta = 'mano' | 'lapiz' | 'goma';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('libro') libro!: ElementRef<HTMLElement>;

  fechaSeleccionada = this.clave(new Date());
  paginas: Date[] = [];
  selectorAbierto = false;
  herramienta: Herramienta = 'mano';
  notas: Record<string, string> = {};
  dibujos: Record<string, string> = {};

  private flipbook?: PageFlip;
  private trazoActivo = false;
  private ultimoPunto = { x: 0, y: 0 };
  private paginaInicial = 100;
  private reconstruyendo = false;

  get dibujando(): boolean {
    return this.herramienta !== 'mano';
  }

  constructor() {
    try {
      this.notas = JSON.parse(localStorage.getItem('agenda-notas') || '{}');
      this.dibujos = JSON.parse(localStorage.getItem('agenda-dibujos') || '{}');
    } catch {
      this.notas = {};
      this.dibujos = {};
    }

    this.generarPaginas(this.fechaSeleccionada);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
  }

  private clave(fecha: Date): string {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  }

  private fechaDe(valor: string): Date {
    const [a, m, d] = valor.split('-').map(Number);
    return new Date(a, m - 1, d, 12);
  }

  claveFecha(fecha: Date): string {
    return this.clave(fecha);
  }

  formato(fecha: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(fecha);
  }

  private generarPaginas(fechaCentral: string): void {
    const inicio = this.fechaDe(fechaCentral);
    inicio.setDate(inicio.getDate() - this.paginaInicial);

    this.paginas = Array.from({ length: 202 }, (_, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + i);
      return fecha;
    });
  }

  ngAfterViewInit(): void {
    this.crearFlipbook();
  }

private crearFlipbook(): void {
  const elemento = this.libro?.nativeElement;
  if (!elemento) return;

  this.flipbook?.destroy();

  // El tamaño se calcula a partir del espacio real del libro.
  const contenedor = elemento.parentElement;
  if (!contenedor) return;

  const anchoPagina = Math.max(260, Math.floor(contenedor.clientWidth / 2));
  const altoPagina = Math.max(360, Math.floor(contenedor.clientHeight));

  this.flipbook = new PageFlip(elemento, {
  width: anchoPagina,
  height: altoPagina,
  flippingTime: 750
});

  const paginasHTML = Array.from(
    elemento.querySelectorAll<HTMLElement>('.page')
  );

  this.flipbook.loadFromHTML(paginasHTML);

  
// Saltar a la página que corresponde a hoy.
this.flipbook.turnToPage(100);

this.flipbook = new PageFlip(elemento, {
  width: anchoPagina,
  height: altoPagina,
  flippingTime: 750
});

this.flipbook.loadFromHTML(paginasHTML);
this.flipbook.turnToPage(100);

  this.flipbook.on('flip', () => {
    const indice = this.flipbook?.getCurrentPageIndex();

    if (indice !== undefined && this.paginas[indice]) {
      this.fechaSeleccionada = this.clave(this.paginas[indice]);
      this.restaurarDibujosVisibles();
    }
  });

  this.flipbook.on('changeState', () => {
    this.restaurarDibujosVisibles();
  });

  this.restaurarDibujosVisibles();
}

  guardarNota(fecha: string, texto: string): void {
    this.notas[fecha] = texto;
    this.guardar('agenda-notas', this.notas);
  }

  private guardar(clave: string, datos: unknown): void {
    try {
      localStorage.setItem(clave, JSON.stringify(datos));
    } catch {
      console.warn('No se han podido guardar los cambios en este navegador.');
    }
  }

 seleccionarHerramienta(herramienta: Herramienta): void {
  this.herramienta = herramienta;
  this.trazoActivo = false;

  if (this.flipbook) {
    this.flipbook.updateSettings({
      pointerInput: herramienta === 'mano' ? ALL_POINTERS : []
    });
  }
}

  pasarPagina(direccion: number): void {
    if (!this.flipbook || this.reconstruyendo) return;
    if (direccion > 0) this.flipbook.flipNext();
    else this.flipbook.flipPrev();
  }

  alternarSelector(): void {
    this.selectorAbierto = !this.selectorAbierto;
  }

  seleccionarFecha(fecha: string): void {
    if (!fecha) return;
    this.selectorAbierto = false;
    this.irA(fecha);
  }

  irAHoy(): void {
    this.irA(this.clave(new Date()));
  }

  private irA(fecha: string): void {
  this.fechaSeleccionada = fecha;
  this.reconstruyendo = true;
  this.generarPaginas(fecha);

  setTimeout(() => {
    this.crearFlipbook();
    this.selectorAbierto = false;
    this.reconstruyendo = false;
  });
}

  iniciarDibujo(evento: PointerEvent, canvas: HTMLCanvasElement): void {
    if (!this.dibujando) return;
    evento.preventDefault();
    canvas.setPointerCapture(evento.pointerId);
    this.trazoActivo = true;
    this.ultimoPunto = this.coordenadas(evento, canvas);

    const contexto = canvas.getContext('2d');
    if (!contexto) return;

    contexto.save();
    contexto.globalCompositeOperation = this.herramienta === 'goma' ? 'destination-out' : 'source-over';
    contexto.beginPath();
    contexto.arc(this.ultimoPunto.x, this.ultimoPunto.y, this.herramienta === 'goma' ? 30 : 1.2, 0, Math.PI * 2);
    contexto.fillStyle = '#51483d';
    contexto.fill();
    contexto.restore();
  }

  moverDibujo(evento: PointerEvent, canvas: HTMLCanvasElement): void {
    if (!this.dibujando || !this.trazoActivo) return;
    evento.preventDefault();

    const punto = this.coordenadas(evento, canvas);
    const contexto = canvas.getContext('2d');
    if (!contexto) return;

    contexto.save();
    contexto.globalCompositeOperation = this.herramienta === 'goma' ? 'destination-out' : 'source-over';
    contexto.beginPath();
    contexto.moveTo(this.ultimoPunto.x, this.ultimoPunto.y);
    contexto.lineTo(punto.x, punto.y);
    contexto.strokeStyle = '#51483d';
    contexto.lineWidth = this.herramienta === 'goma' ? 60 : 2.5;
    contexto.lineCap = 'round';
    contexto.lineJoin = 'round';
    contexto.stroke();
    contexto.restore();

    this.ultimoPunto = punto;
  }

  terminarDibujo(canvas: HTMLCanvasElement): void {
    if (!this.trazoActivo) return;
    this.trazoActivo = false;

    const fecha = canvas.dataset['canvasDate'];
    if (!fecha) return;

    this.dibujos[fecha] = canvas.toDataURL('image/png');
    this.guardar('agenda-dibujos', this.dibujos);
  }

  private coordenadas(evento: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evento.clientX - rect.left) * canvas.width / rect.width,
      y: (evento.clientY - rect.top) * canvas.height / rect.height
    };
  }

  private restaurarDibujosVisibles(): void {
    if (!this.libro?.nativeElement) return;

    const canvases = this.libro.nativeElement.querySelectorAll<HTMLCanvasElement>('canvas[data-canvas-date]');

    canvases.forEach(canvas => {
      const fecha = canvas.dataset['canvasDate'];
      if (!fecha) return;

      const contexto = canvas.getContext('2d');
      if (!contexto) return;

      contexto.clearRect(0, 0, canvas.width, canvas.height);
      const guardado = this.dibujos[fecha];
      if (!guardado) return;

      const imagen = new Image();
      imagen.onload = () => contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
      imagen.src = guardado;
    });
  }

  @HostListener('window:resize')
  redimensionar(): void {
    // La biblioteca gestiona los cambios de tamaño de su contenedor.
  }

  @HostListener('document:keydown', ['$event'])
  teclado(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.selectorAbierto = false;
      this.seleccionarHerramienta('mano');
      return;
    }

    const elemento = evento.target as HTMLElement;
    if (elemento?.tagName === 'TEXTAREA' || elemento?.tagName === 'INPUT') return;

    if (evento.key === 'ArrowRight') this.pasarPagina(1);
    if (evento.key === 'ArrowLeft') this.pasarPagina(-1);
    if (evento.key.toLowerCase() === 'd') this.seleccionarHerramienta('lapiz');
    if (evento.key.toLowerCase() === 'e') this.seleccionarHerramienta('goma');
    if (evento.key.toLowerCase() === 'h') this.seleccionarHerramienta('mano');
  }

  ngOnDestroy(): void {
    this.flipbook?.destroy();
  }
}
