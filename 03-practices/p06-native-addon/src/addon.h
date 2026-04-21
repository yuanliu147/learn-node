#ifndef ADDON_H
#define ADDON_H

#include <napi.h>
#include <cstdint>

namespace addon {

uint32_t Add(uint32_t a, uint32_t b);
uint32_t Fibonacci(uint32_t n);
bool IsPrime(uint32_t n);
Napi::String GetVersion(const Napi::Env& env);

}  // namespace addon

#endif  // ADDON_H
