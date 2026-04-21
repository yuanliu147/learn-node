#include "addon.h"
#include <node/node.h>

namespace addon {

uint32_t Add(uint32_t a, uint32_t b) {
  return a + b;
}

uint32_t Fibonacci(uint32_t n) {
  if (n <= 1) return n;
  uint32_t a = 0, b = 1;
  for (uint32_t i = 2; i <= n; i++) {
    uint32_t temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

bool IsPrime(uint32_t n) {
  if (n < 2) return false;
  if (n == 2) return true;
  if (n % 2 == 0) return false;
  
  for (uint32_t i = 3; i * i <= n; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

Napi::String GetVersion(const Napi::Env& env) {
  return Napi::String::New(env, NODE_VERSION);
}

// Init function for N-API
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "add"),
              Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
    env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
      Napi::TypeError::New(env, "Expected two numbers").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    uint32_t a = info[0].As<Napi::Number>().Uint32Value();
    uint32_t b = info[1].As<Napi::Number>().Uint32Value();
    return Napi::Number::New(env, Add(a, b));
  }));

  exports.Set(Napi::String::New(env, "fibonacci"),
              Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
    env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
      Napi::TypeError::New(env, "Expected a number").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    uint32_t n = info[0].As<Napi::Number>().Uint32Value();
    return Napi::Number::New(env, Fibonacci(n));
  }));

  exports.Set(Napi::String::New(env, "isPrime"),
              Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
    env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
      Napi::TypeError::New(env, "Expected a number").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    uint32_t n = info[0].As<Napi::Number>().Uint32Value();
    return Napi::Boolean::New(env, IsPrime(n));
  }));

  exports.Set(Napi::String::New(env, "getVersion"),
              Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
    return GetVersion(info.Env());
  }));

  return exports;
}

NODE_API_MODULE(addon, Init)

}  // namespace addon
