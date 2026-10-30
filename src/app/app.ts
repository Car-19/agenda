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

  grosorLapiz = 2.5;
  grosorGoma = 30;

  posicionGoma = { x: 0, y: 0 };
  mostrarGoma: string | null = null;
  tamanoGomaVisual = 15;

  private ultimoGrosor = 2.5;
  private indicePaginaActual = 100;
  private temporizadorRedimension: ReturnType<typeof setTimeout> | undefined;

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
    const texto = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(fecha);

    return texto.charAt(0).toLocaleUpperCase('es-ES') + texto.slice(1);
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

    const contenedor = elemento.parentElement;
    if (!contenedor) return;

    const movilVertical =
      window.innerWidth <= 650 &&
      window.innerHeight > window.innerWidth;

    const paginasVisibles = movilVertical ? 1 : 2;
    const proporcion = 0.70;

    const anchoDisponible = contenedor.clientWidth / paginasVisibles;
    const altoDisponible = contenedor.clientHeight;

    const altoPagina = Math.floor(
      Math.min(altoDisponible, anchoDisponible / proporcion)
    );

    const anchoPagina = Math.floor(altoPagina * proporcion);

    this.flipbook = new PageFlip(elemento, {
      width: anchoPagina,
      height: altoPagina,
      flippingTime: 900,
      usePortrait: true,
      drawShadow: true,
      maxShadowOpacity: 0.28,
      swipeDistance: 30
    });

    const paginasHTML = Array.from(
      elemento.querySelectorAll<HTMLElement>('.page')
    );

    this.flipbook.loadFromHTML(paginasHTML);

    const indice = Math.max(
      0,
      Math.min(this.indicePaginaActual, this.paginas.length - 1)
    );

    this.flipbook.turnToPage(indice);

    this.flipbook.on('flip', () => {
      const indiceActual = this.flipbook?.getCurrentPageIndex();

      if (indiceActual !== undefined && this.paginas[indiceActual]) {
        this.indicePaginaActual = indiceActual;
        this.fechaSeleccionada = this.clave(this.paginas[indiceActual]);
        this.restaurarDibujosVisibles();
        this.mostrarGoma = null;
      }
    });

    this.flipbook.on('changeState', () => {
      this.restaurarDibujosVisibles();
    });

    this.restaurarDibujosVisibles();
    this.seleccionarHerramienta(this.herramienta);
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

    if (herramienta !== 'goma') {
      this.mostrarGoma = null;
    }

    if (this.flipbook) {
      this.flipbook.updateSettings({
        pointerInput: herramienta === 'mano' ? ALL_POINTERS : []
      });
    }
  }

  pasarPagina(direccion: number): void {
    if (!this.flipbook || this.reconstruyendo) return;

    if (direccion > 0) {
      this.flipbook.flipNext();
    } else {
      this.flipbook.flipPrev();
    }
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
    this.indicePaginaActual = 100;
    this.reconstruyendo = true;
    this.mostrarGoma = null;

    this.generarPaginas(fecha);

    setTimeout(() => {
      this.crearFlipbook();
      this.selectorAbierto = false;
      this.reconstruyendo = false;
    });
  }

  private coordenadas(
    evento: PointerEvent,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();

    return {
      x: (evento.clientX - rect.left) * (canvas.width / rect.width),
      y: (evento.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  iniciarDibujo(evento: PointerEvent, canvas: HTMLCanvasElement): void {
    if (!this.dibujando) return;

    evento.preventDefault();
    canvas.setPointerCapture(evento.pointerId);

    this.trazoActivo = true;
    this.ultimoPunto = this.coordenadas(evento, canvas);

    const contexto = canvas.getContext('2d');
    if (!contexto) return;

    this.ultimoGrosor = this.calcularGrosor(evento);

    contexto.save();
    contexto.globalCompositeOperation =
      this.herramienta === 'goma' ? 'destination-out' : 'source-over';

    contexto.beginPath();
    contexto.arc(
      this.ultimoPunto.x,
      this.ultimoPunto.y,
      this.ultimoGrosor / 2,
      0,
      Math.PI * 2
    );

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

    const grosorActual = this.calcularGrosor(evento);
    const grosorMedio = (this.ultimoGrosor + grosorActual) / 2;

    contexto.save();
    contexto.globalCompositeOperation =
      this.herramienta === 'goma' ? 'destination-out' : 'source-over';

    contexto.beginPath();
    contexto.moveTo(this.ultimoPunto.x, this.ultimoPunto.y);
    contexto.lineTo(punto.x, punto.y);

    contexto.strokeStyle = '#51483d';
    contexto.lineWidth = grosorMedio;
    contexto.lineCap = 'round';
    contexto.lineJoin = 'round';
    contexto.stroke();
    contexto.restore();

    this.ultimoPunto = punto;
    this.ultimoGrosor = grosorActual;
  }

  private calcularGrosor(evento: PointerEvent): number {
    const base = this.herramienta === 'goma'
      ? this.grosorGoma
      : this.grosorLapiz;

    if (
      this.herramienta === 'lapiz' &&
      evento.pointerType === 'pen' &&
      evento.pressure > 0
    ) {
      return base * (0.25 + evento.pressure * 1.5);
    }

    return base;
  }

  terminarDibujo(canvas: HTMLCanvasElement): void {
    if (!this.trazoActivo) return;

    this.trazoActivo = false;

    const fecha = canvas.dataset['canvasDate'];
    if (!fecha) return;

    this.dibujos[fecha] = canvas.toDataURL('image/png');
    this.guardar('agenda-dibujos', this.dibujos);
  }

  private restaurarDibujosVisibles(): void {
    if (!this.libro?.nativeElement) return;

    const canvases = this.libro.nativeElement.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-canvas-date]'
    );

    canvases.forEach(canvas => {
      const fecha = canvas.dataset['canvasDate'];
      if (!fecha) return;

      const contexto = canvas.getContext('2d');
      if (!contexto) return;

      contexto.clearRect(0, 0, canvas.width, canvas.height);

      const guardado = this.dibujos[fecha];
      if (!guardado) return;

      const imagen = new Image();

      imagen.onload = () => {
        contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
      };

      imagen.src = guardado;
    });
  }

  @HostListener('window:resize')
  redimensionar(): void {
    if (!this.libro?.nativeElement || !this.flipbook) return;

    this.indicePaginaActual = this.flipbook.getCurrentPageIndex();
    this.reconstruyendo = true;

    if (this.temporizadorRedimension) {
      clearTimeout(this.temporizadorRedimension);
    }

    this.temporizadorRedimension = setTimeout(() => {
      this.crearFlipbook();
      this.reconstruyendo = false;
      this.temporizadorRedimension = undefined;
    }, 250);
  }

  @HostListener('document:keydown', ['$event'])
  teclado(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.selectorAbierto = false;
      this.seleccionarHerramienta('mano');
      return;
    }

    const elemento = evento.target as HTMLElement;

    if (elemento?.tagName === 'TEXTAREA' || elemento?.tagName === 'INPUT') {
      return;
    }

    if (evento.key === 'ArrowRight') this.pasarPagina(1);
    if (evento.key === 'ArrowLeft') this.pasarPagina(-1);
    if (evento.key.toLowerCase() === 'd') this.seleccionarHerramienta('lapiz');
    if (evento.key.toLowerCase() === 'e') this.seleccionarHerramienta('goma');
    if (evento.key.toLowerCase() === 'h') this.seleccionarHerramienta('mano');
  }

  actualizarPunteroGoma(
    evento: PointerEvent,
    canvas: HTMLCanvasElement
  ): void {
    if (this.herramienta !== 'goma') {
      this.mostrarGoma = null;
      return;
    }

    const rect = canvas.getBoundingClientRect();

    this.posicionGoma = {
      x: evento.clientX - rect.left,
      y: evento.clientY - rect.top
    };

    // Ajustamos el círculo visual al tamaño real del canvas en pantalla.
    this.tamanoGomaVisual = this.grosorGoma * (rect.width / canvas.width);

    // Solo se muestra el cursor de la página bajo el puntero.
    this.mostrarGoma = canvas.dataset['canvasDate'] || null;
  }

  ocultarPunteroGoma(canvas: HTMLCanvasElement): void {
    const fecha = canvas.dataset['canvasDate'];

    if (this.mostrarGoma === fecha) {
      this.mostrarGoma = null;
    }
  }

  ngOnDestroy(): void {
    if (this.temporizadorRedimension) {
      clearTimeout(this.temporizadorRedimension);
    }

    this.flipbook?.destroy();
  }
}