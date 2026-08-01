// The club cover's shape, decided once.
//
// The cropper framed 4:1 and the header drew a fixed 104px strip inside a
// column whose width depends on the screen, so the two never agreed: on a
// phone the header was about 4.4:1 and on a desktop closer to 5.6:1, and
// `bg-cover` quietly ate the difference off the top and bottom. What you
// framed was never what you got, and the wider the screen the thinner the
// slice, which is why a cover came out as a letterbox.
//
// So there is no fixed height anywhere. Both the header and the clubs-tab
// card head draw this ratio, the cropper frames the same number, and the two
// are the same picture at every width.
//
// The number itself was 4:1, and matching the header to it only made both of
// them a letterbox. Nothing anybody photographs is 4:1: a phone shoots 4:3,
// so that frame throws away two thirds of the picture and there is no way to
// choose which two thirds matter. 5:2 is close to what a cover is elsewhere,
// it holds a real photograph, and on the 460px column it is 184px tall, which
// is a picture rather than a stripe.
export const BANNER_ASPECT = 2.5

// Tailwind cannot read the constant, so the class is here next to it and the
// two are checked against each other by the one test that matters: the
// cropper and the header being the same shape on screen.
export const BANNER_ASPECT_CLASS = 'aspect-[5/2]'
