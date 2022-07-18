# [1.5.0](https://github.com/lidofinance/lido-council-daemon/compare/1.4.2...1.5.0) (2022-07-18)


### Bug Fixes

* git version in docker ([1013166](https://github.com/lidofinance/lido-council-daemon/commit/1013166b533456cb68dd973958e4f38883b93181))
* log invalid deposit data ([eff7f91](https://github.com/lidofinance/lido-council-daemon/commit/eff7f910119b6b9fe7b3de038d62c8d86fce35e0))


### Features

* dsm adddress ossification ([9359e0c](https://github.com/lidofinance/lido-council-daemon/commit/9359e0c16c6a9a1d974783a1645eed7568929ca8))
* exclude eligible intersections ([5cb5b9c](https://github.com/lidofinance/lido-council-daemon/commit/5cb5b9c8f125c8c92f9f0c6d1e53008e4770f383))
* intersections metrics ([6fef341](https://github.com/lidofinance/lido-council-daemon/commit/6fef341c2a83eba3f0beba89ec6692c178bce91d))
* New release wf ([#61](https://github.com/lidofinance/lido-council-daemon/issues/61)) ([dd0375a](https://github.com/lidofinance/lido-council-daemon/commit/dd0375a1dc96767fca66ad58de4a0afba9d1606e))
* verify deposits signatures ([3a5bd04](https://github.com/lidofinance/lido-council-daemon/commit/3a5bd04c24926772ba953a37f649b371b5d0286b))



## [1.4.2](https://github.com/lidofinance/lido-council-daemon/compare/1.4.1...1.4.2) (2022-06-06)


### Bug Fixes

* move contracts init after app start ([a178cff](https://github.com/lidofinance/lido-council-daemon/commit/a178cff47e4847227caa0d8a928aef805eb8ec22))



## [1.4.1](https://github.com/lidofinance/lido-council-daemon/compare/1.4.0...1.4.1) (2022-06-06)


### Bug Fixes

* get events in chunks ([79c2bd6](https://github.com/lidofinance/lido-council-daemon/commit/79c2bd67577c4cca7ba42835521e1633be8cb4be))
* geth large log query ([979e24e](https://github.com/lidofinance/lido-council-daemon/commit/979e24eea8cf6c68e9e5f89722f82fd2af30dafa))



# [1.4.0](https://github.com/lidofinance/lido-council-daemon/compare/1.3.0...1.4.0) (2022-05-26)


### Features

* contracts ([75dfaa3](https://github.com/lidofinance/lido-council-daemon/commit/75dfaa398acb881ccf41fc2d80e2bab96f72d273))



# [1.3.0](https://github.com/lidofinance/lido-council-daemon/compare/1.2.1...1.3.0) (2022-05-26)


### Features

* contracts ([218382a](https://github.com/lidofinance/lido-council-daemon/commit/218382a6a9f45e9f9bcf54a7346490634a335ee1))



## [1.2.1](https://github.com/lidofinance/lido-council-daemon/compare/1.2.0...1.2.1) (2022-04-17)


### Bug Fixes

* increase heap limit ([308ad6d](https://github.com/lidofinance/lido-council-daemon/commit/308ad6d5c6eb385fcf7557ba05d7a35cd8e77775))



# [1.2.0](https://github.com/lidofinance/lido-council-daemon/compare/1.1.3...1.2.0) (2022-04-17)


### Bug Fixes

* deposit cache validating ([a7cdfcb](https://github.com/lidofinance/lido-council-daemon/commit/a7cdfcb39a0b7624647747e776db539919cee194))
* Docker + security and docker lints ([7698a0c](https://github.com/lidofinance/lido-council-daemon/commit/7698a0cc550323e36cc82c819bf935d4ec9d9d29))
* fetch operators data by blockhash ([a0f746e](https://github.com/lidofinance/lido-council-daemon/commit/a0f746eb63448aae28fe89af873833d6d6c98f2b))
* guardian test ([4685d9c](https://github.com/lidofinance/lido-council-daemon/commit/4685d9c4d359fc11a36db0209303d393081d1810))
* not root docker user ([0423948](https://github.com/lidofinance/lido-council-daemon/commit/04239489a42e7b0ce301f1ec57e7aa79c38dd6fe))
* replace with user node ([4b14d31](https://github.com/lidofinance/lido-council-daemon/commit/4b14d31a202c3a3b6c34b4be31f89d93edf92fcc))
* timer ([f8a456a](https://github.com/lidofinance/lido-council-daemon/commit/f8a456ab745d936c879b48e4e8c68a8618d299e2))
* vuln fix - bump minimist to 1.2.6 ([b583a32](https://github.com/lidofinance/lido-council-daemon/commit/b583a321d8d9ff37948ab5c588bafe9207c25814))


### Features

* dummy docs update to start dev build ([e54c6ce](https://github.com/lidofinance/lido-council-daemon/commit/e54c6ce9875cf2de34d7155be1bb2bde90ee76d6))
* extend pause message ([d0378e1](https://github.com/lidofinance/lido-council-daemon/commit/d0378e1b1baba84541e2a10dbab8636691578afd))
* fetch data by blockhash ([80cf072](https://github.com/lidofinance/lido-council-daemon/commit/80cf072093b2b23ae001f2dab20b06a3b9968e42))
* get initial NO data by blockhash ([f3ed421](https://github.com/lidofinance/lido-council-daemon/commit/f3ed421e9358c0a078c1995fd25db1540177305c))
* health checks ([7cbef83](https://github.com/lidofinance/lido-council-daemon/commit/7cbef836d081e22974f5eb1b93accdfc5788503f))
* improve initial cache check logs ([8cbd995](https://github.com/lidofinance/lido-council-daemon/commit/8cbd99557dc103e0887efe3d6cab35c0baeb39a3))
* improve logs ([cec34f5](https://github.com/lidofinance/lido-council-daemon/commit/cec34f5fc1dbeaf1a59b1014d3a88313a7b35a0d))
* network for build info ([d53d72d](https://github.com/lidofinance/lido-council-daemon/commit/d53d72d0b6eb034318079e50cc59d0f48ff2e1c7))
* ping message ([3aa7d9e](https://github.com/lidofinance/lido-council-daemon/commit/3aa7d9e555b335b097a58b6e11a8aa78141da441))
* update docs ([cc51ad5](https://github.com/lidofinance/lido-council-daemon/commit/cc51ad56eb9638e0233fc403a1093092bef579c5))



