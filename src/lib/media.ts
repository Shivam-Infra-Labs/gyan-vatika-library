export interface MediaPhotoAsset {
  id: string;
  originalFilename: string;
  src: string;
  placement: 'hero' | 'tour' | 'collection' | 'gallery';
  category: 'Reading Room' | 'Book details' | 'Around the library';
  title: string;
  caption: string;
  alt: string;
  focalPoint: string;
  width: number;
  height: number;
}

export interface MediaVideoAsset {
  id: string;
  originalFilename: string;
  src: string;
  posterSrc: string;
  placement: 'hero-tour' | 'gallery-film';
  title: string;
  caption: string;
  durationLabel: string;
  aspectRatio: '9:16';
}

export const LIBRARY_PHOTOS: MediaPhotoAsset[] = [
  {
    id: 'reading-room-aisle',
    originalFilename: 'unnamed2.jpg',
    src: '/assets/aistudio/unnamed2_f8b3b82b.jpg',
    placement: 'hero',
    category: 'Reading Room',
    title: 'Central Reading-Room Aisle',
    caption: 'Quiet partitioned desks along the sunlit central aisle with indoor greenery and wall-mounted cooling.',
    alt: 'Central reading-room aisle at Gyan Vatika Library with partitioned study desks, students studying, ceiling fan, air conditioner, and foreground indoor plant',
    focalPoint: '50% 42%',
    width: 765,
    height: 1020,
  },
  {
    id: 'tree-bookshelf',
    originalFilename: 'unnamed3.jpg',
    src: '/assets/aistudio/unnamed3_6d1a5894.jpg',
    placement: 'tour',
    category: 'Around the library',
    title: 'The Tree-Shaped Bookshelf',
    caption: 'Handcrafted branching wall shelf above desks 41 and 42—stocked with philosophy, Hindi & English literature, and study essentials.',
    alt: 'Tree-shaped wooden bookshelf on the white wall of Gyan Vatika Library above study desks 41 and 42 with small potted plants and framed library quotes',
    focalPoint: '50% 35%',
    width: 765,
    height: 1020,
  },
  {
    id: 'collection-globe-spread',
    originalFilename: 'unnamed1.jpg',
    src: '/assets/aistudio/unnamed1_54ef54e2.jpg',
    placement: 'collection',
    category: 'Around the library',
    title: 'Curated Shelf & World Globe',
    caption: 'Browse Hindi literature, biographies, classics, and competitive exam titles organized beside the desk globe.',
    alt: 'Wide bookshelf at Gyan Vatika Library labeled Hindi Literature, Humanity, Biographies, and Novels beside a blue desk globe',
    focalPoint: '55% 48%',
    width: 1020,
    height: 765,
  },
  {
    id: 'orwell-1984',
    originalFilename: 'unnamed5.jpg',
    src: '/assets/aistudio/unnamed5_fe1be596.jpg',
    placement: 'gallery',
    category: 'Book details',
    title: '1984 — George Orwell',
    caption: 'Reading desk close-up of George Orwell’s 1984 beside warm evening ambient light and the Constitution of India wall chart.',
    alt: 'Paperback copy of 1984 by George Orwell on a dark study desk next to a glowing lantern with bookshelves behind',
    focalPoint: '45% 50%',
    width: 1020,
    height: 765,
  },
  {
    id: 'of-human-bondage',
    originalFilename: 'unnamed6.jpg',
    src: '/assets/aistudio/unnamed6_7d5689e9.jpg',
    placement: 'gallery',
    category: 'Book details',
    title: 'Of Human Bondage — W. Somerset Maugham',
    caption: 'Quiet evening reading corner featuring Of Human Bondage alongside our Humanity & Atomic Habits collection.',
    alt: 'Close-up of Of Human Bondage by William Somerset Maugham standing upright on a reading desk beside a decorative rose lantern',
    focalPoint: '42% 48%',
    width: 1020,
    height: 765,
  },
  {
    id: 'sunlit-hanging-planter',
    originalFilename: 'unnamed9.jpg',
    src: '/assets/aistudio/unnamed9_31154063.jpg',
    placement: 'gallery',
    category: 'Around the library',
    title: 'Entrance Planter & Quiet Zone',
    caption: 'Upcycled cycle-rim hanging greenery and warm filament glow welcoming members into the Silence Quiet Zone.',
    alt: 'Hanging cycle-rim planter filled with trailing green leaves and warm filament bulb outside the Silence Quiet Zone library entrance doors',
    focalPoint: '50% 45%',
    width: 765,
    height: 1020,
  },
];

export const LIBRARY_VIDEOS: MediaVideoAsset[] = [
  {
    id: 'inside-reading-room',
    originalFilename: 'videoplayback.mp4',
    src: '/assets/aistudio/videoplayback_a11fb523.mp4',
    posterSrc: '/assets/posters/videoplayback_poster.jpg',
    placement: 'hero-tour',
    title: 'Inside the reading room',
    caption: 'A quiet walkthrough past the window-side partitioned desks during an active study shift.',
    durationLabel: '0:12',
    aspectRatio: '9:16',
  },
  {
    id: 'by-the-bookshelf',
    originalFilename: 'videoplayback5.mp4',
    src: '/assets/aistudio/videoplayback5_9b332c11.mp4',
    posterSrc: '/assets/posters/videoplayback5_poster.jpg',
    placement: 'gallery-film',
    title: 'By the bookshelf',
    caption: 'The main yellow-and-green reading shelf stocked with biographies, humanity titles, and new arrivals.',
    durationLabel: '0:08',
    aspectRatio: '9:16',
  },
  {
    id: 'books-on-the-desk',
    originalFilename: 'videoplayback6.mp4',
    src: '/assets/aistudio/videoplayback6_97ebc562.mp4',
    posterSrc: '/assets/posters/videoplayback6_poster.jpg',
    placement: 'gallery-film',
    title: 'Books on the desk',
    caption: 'Freshly stacked new arrivals waiting on the counter beside the study cubicles.',
    durationLabel: '0:07',
    aspectRatio: '9:16',
  },
];

export const HERO_PHOTO = LIBRARY_PHOTOS[0];
export const TOUR_PHOTOS = [LIBRARY_PHOTOS[0], LIBRARY_PHOTOS[1], LIBRARY_PHOTOS[2]];
export const GALLERY_PHOTOS = LIBRARY_PHOTOS;
export const PRIMARY_TOUR_VIDEO = LIBRARY_VIDEOS[0];
